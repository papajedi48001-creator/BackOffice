#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root_dir="$(cd "${script_dir}/../.." && pwd)"
compose_file="${STAGING_COMPOSE_FILE:-${root_dir}/infra/compose/docker-compose.staging.yml}"
env_file="${STAGING_COMPOSE_ENV_FILE:-${root_dir}/infra/compose/.env.production.example}"
project_name="${STAGING_COMPOSE_PROJECT_NAME:-waritch-backoffice-restore}"
required_tables=(schema_migration person organization employment_assignment request approval_step request_cancellation audit_event outbox_event notification user_session room room_booking room_booking_day hr_organization_head hr_employment_type hr_person_profile leave_type leave_entitlement leave_holiday leave_setting leave_request leave_cancellation leave_opening_balance inventory_item inventory_lot inventory_movement inventory_receipt attachment attachment_scan official_travel)

if [[ "${1:-}" == "--check" ]]; then
  command -v docker >/dev/null
  command -v gpg >/dev/null
  [[ -r "${root_dir}/packages/db/src/migrate.ts" ]]
  printf 'restore verification prerequisites are available\n'
  exit 0
fi

backup_file="${BACKUP_FILE:?BACKUP_FILE is required}"
key_file="${BACKUP_ENCRYPTION_KEY_FILE:?BACKUP_ENCRYPTION_KEY_FILE is required}"
[[ -r "${backup_file}" ]] || { echo "backup archive is not readable" >&2; exit 1; }
[[ -r "${key_file}" ]] || { echo "backup key file is not readable" >&2; exit 1; }

work_dir="$(mktemp -d)"
trap 'rm -rf "${work_dir}"' EXIT
gpg --batch --yes --pinentry-mode loopback --passphrase-file "${key_file}" --decrypt "${backup_file}" | tar -C "${work_dir}" -xf -
[[ -s "${work_dir}/database.sql" && -s "${work_dir}/attachments.tar" ]] || { echo "backup archive is incomplete" >&2; exit 1; }

compose=(docker compose --project-name "${project_name}" --env-file "${env_file}" -f "${compose_file}")
"${compose[@]}" up -d mariadb
cat "${work_dir}/database.sql" | "${compose[@]}" exec -T mariadb sh -ec 'MYSQL_PWD="$(cat /run/secrets/mariadb_root_password)" mariadb -uroot "$MARIADB_DATABASE"'
# Files go back into the volume before SeaweedFS starts, so it reads a whole data directory.
cat "${work_dir}/attachments.tar" | "${compose[@]}" run --rm --no-deps -T --entrypoint tar seaweedfs -C /data -xf -
"${compose[@]}" up -d --wait seaweedfs
mariadb_query() {
  "${compose[@]}" exec -T mariadb sh -ec 'MYSQL_PWD="$(cat /run/secrets/mariadb_root_password)" mariadb -uroot -Nse "$1" "$MARIADB_DATABASE"' sh "$1"
}

for table in "${required_tables[@]}"; do
  row_count="$(mariadb_query "SELECT COUNT(*) FROM ${table}" | tr -d '[:space:]')"
  [[ "${row_count}" =~ ^[0-9]+$ ]] || { echo "restore verification failed: ${table} is not queryable" >&2; exit 1; }
  printf 'restore verification: %s=%s\n' "${table}" "${row_count}"
done

mapfile -t expected_versions < <(grep -oE "'[0-9]{4}_[a-z0-9_]+\.sql'" "${root_dir}/packages/db/src/migrate.ts" | tr -d "'")
for version in "${expected_versions[@]}"; do
  applied="$(mariadb_query "SELECT COUNT(*) FROM schema_migration WHERE version = '${version}'" | tr -d '[:space:]')"
  [[ "${applied}" == "1" ]] || { echo "restore verification failed: migration ${version} is not recorded" >&2; exit 1; }
done
# Read the newest attachment back through the restored filer (loopback inside the container) and compare its size.
bucket="$(sed -n 's/^S3_BUCKET=//p' "${env_file}" | tail -n 1)"
object_key=''
size_bytes=''
read -r object_key size_bytes < <(mariadb_query "SELECT object_key, size_bytes FROM attachment ORDER BY created_at DESC LIMIT 1") || true
if [[ -n "${object_key}" ]]; then
  restored_bytes="$("${compose[@]}" exec -T seaweedfs sh -ec 'wget -q -O - "http://127.0.0.1:8888/buckets/$1/$2" | wc -c' sh "${bucket}" "${object_key}" | tr -d '[:space:]')"
  [[ "${restored_bytes}" == "${size_bytes}" ]] || { echo "restore verification failed: the newest attachment did not read back whole" >&2; exit 1; }
  printf 'restore verification: newest attachment read back (%s bytes)\n' "${restored_bytes}"
else
  printf 'restore verification: no attachments to read back\n'
fi
printf 'restore verification completed: %s tables, %s migrations\n' "${#required_tables[@]}" "${#expected_versions[@]}"

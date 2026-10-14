#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root_dir="$(cd "${script_dir}/../.." && pwd)"
compose_file="${STAGING_COMPOSE_FILE:-${root_dir}/infra/compose/docker-compose.staging.yml}"
env_file="${STAGING_COMPOSE_ENV_FILE:-${root_dir}/infra/compose/.env.production.example}"
project_name="${STAGING_COMPOSE_PROJECT_NAME:-waritch-backoffice-restore}"
required_tables=(schema_migration person organization request approval_step audit_event outbox_event notification)

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
"${compose[@]}" up -d mariadb minio
cat "${work_dir}/database.sql" | "${compose[@]}" exec -T mariadb sh -ec 'MYSQL_PWD="$(cat /run/secrets/mariadb_root_password)" mariadb -uroot "$MARIADB_DATABASE"'
cat "${work_dir}/attachments.tar" | "${compose[@]}" exec -T minio tar -C /data -xf -
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
printf 'restore verification completed: %s tables, %s migrations\n' "${#required_tables[@]}" "${#expected_versions[@]}"

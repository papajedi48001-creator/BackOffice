#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root_dir="$(cd "${script_dir}/../.." && pwd)"
compose_file="${STAGING_COMPOSE_FILE:-${root_dir}/infra/compose/docker-compose.staging.yml}"
env_file="${STAGING_COMPOSE_ENV_FILE:-${root_dir}/infra/compose/.env.production.example}"
project_name="${STAGING_COMPOSE_PROJECT_NAME:-waritch-backoffice-restore}"

if [[ "${1:-}" == "--check" ]]; then
  command -v docker >/dev/null
  command -v gpg >/dev/null
  grep -Fq 'foundation_person' "${BASH_SOURCE[0]}"
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
person_count="$("${compose[@]}" exec -T mariadb sh -ec 'MYSQL_PWD="$(cat /run/secrets/mariadb_root_password)" mariadb -uroot -Nse "SELECT COUNT(*) FROM foundation_person" "$MARIADB_DATABASE"')"
[[ "${person_count}" =~ ^[0-9]+$ ]] || { echo "foundation_person verification failed" >&2; exit 1; }
printf 'restore verification completed: foundation_person=%s\n' "${person_count}"

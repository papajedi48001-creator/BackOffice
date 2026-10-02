#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root_dir="$(cd "${script_dir}/../.." && pwd)"
compose_file="${COMPOSE_FILE:-${root_dir}/infra/compose/docker-compose.production.yml}"
env_file="${COMPOSE_ENV_FILE:-${root_dir}/infra/compose/.env.production.example}"

if [[ "${1:-}" == "--check" ]]; then
  command -v docker >/dev/null
  command -v gpg >/dev/null
  command -v sha256sum >/dev/null
  printf 'backup prerequisites are available\n'
  exit 0
fi

project_name="${COMPOSE_PROJECT_NAME:?COMPOSE_PROJECT_NAME is required}"
backup_dir="${BACKUP_DIR:?BACKUP_DIR is required}"
key_file="${BACKUP_ENCRYPTION_KEY_FILE:?BACKUP_ENCRYPTION_KEY_FILE is required}"
retention_days="${BACKUP_RETENTION_DAYS:?BACKUP_RETENTION_DAYS is required}"
[[ -r "${key_file}" ]] || { echo "backup key file is not readable" >&2; exit 1; }
[[ "${retention_days}" =~ ^[0-9]+$ ]] || { echo "BACKUP_RETENTION_DAYS must be an integer" >&2; exit 1; }
mkdir -p "${backup_dir}"
chmod 700 "${backup_dir}"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
work_dir="$(mktemp -d)"
archive="${backup_dir}/backoffice-${timestamp}.tar.gpg"
metadata="${backup_dir}/backoffice-${timestamp}.json"
trap 'rm -rf "${work_dir}"' EXIT

compose=(docker compose --project-name "${project_name}" --env-file "${env_file}" -f "${compose_file}")
"${compose[@]}" exec -T mariadb sh -ec 'MYSQL_PWD="$(cat /run/secrets/mariadb_root_password)" mariadb-dump -uroot --single-transaction --routines --events "$MARIADB_DATABASE"' > "${work_dir}/database.sql"
"${compose[@]}" exec -T minio tar -C /data -cf - . > "${work_dir}/attachments.tar"

tar -C "${work_dir}" -cf - database.sql attachments.tar | gpg --batch --yes --pinentry-mode loopback --passphrase-file "${key_file}" --symmetric --cipher-algo AES256 --output "${archive}"
archive_sha256="$(sha256sum "${archive}" | awk '{print $1}')"
printf '{"completedAt":"%s","archive":"%s","sha256":"%s","retentionDays":%s,"result":"success"}\n' "$(date -u +%FT%TZ)" "$(basename "${archive}")" "${archive_sha256}" "${retention_days}" > "${metadata}"
chmod 600 "${archive}" "${metadata}"
find "${backup_dir}" -type f \( -name 'backoffice-*.tar.gpg' -o -name 'backoffice-*.json' \) -mtime "+${retention_days}" -delete
printf 'backup completed: %s\n' "${archive}"

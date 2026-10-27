#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root_dir="$(cd "${script_dir}/../.." && pwd)"
restore_script="${RESTORE_VERIFY_SCRIPT:-${script_dir}/restore-verify.sh}"
schema_sources=("${root_dir}"/packages/db/migrations/*.sql "${root_dir}/packages/db/src/migrate.ts")

assert_restore_contains() {
  local expected="$1"
  if ! grep -Fq "${expected}" "${restore_script}"; then
    echo "restore verification must check ${expected}" >&2
    exit 1
  fi
}

required_line="$(grep -E '^required_tables=\(' "${restore_script}" || true)"
[[ -n "${required_line}" ]] || { echo "restore verification must declare required_tables" >&2; exit 1; }
read -r -a required_tables <<< "$(printf '%s\n' "${required_line}" | sed -E 's/^required_tables=\((.*)\)$/\1/')"
[[ "${#required_tables[@]}" -gt 0 ]] || { echo "required_tables must not be empty" >&2; exit 1; }

for table in "${required_tables[@]}"; do
  if ! grep -Eq "CREATE TABLE IF NOT EXISTS ${table} " "${schema_sources[@]}"; then
    echo "restore verification checks ${table}, but no migration creates it" >&2
    exit 1
  fi
done

assert_restore_contains "person"
assert_restore_contains "schema_migration"
assert_restore_contains "BACKUP_ENCRYPTION_KEY_FILE"
assert_restore_contains "attachment"
assert_restore_contains "run --rm --no-deps -T --entrypoint tar seaweedfs"
for script in "${restore_script}" "${script_dir}/backup.sh"; do
  if grep -qi minio "${script}"; then
    echo "$(basename "${script}") must back up SeaweedFS, not MinIO" >&2
    exit 1
  fi
done
echo "restore verification checks ${#required_tables[@]} migrated tables in the encrypted backup"

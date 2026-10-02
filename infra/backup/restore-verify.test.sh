#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

assert_restore_contains() {
  local expected="$1"
  if ! grep -Fq "${expected}" "${script_dir}/restore-verify.sh"; then
    echo "restore verification must check ${expected}" >&2
    exit 1
  fi
}

assert_restore_contains "foundation_person"
assert_restore_contains "BACKUP_ENCRYPTION_KEY_FILE"
echo "restore verification checks encrypted backup content"

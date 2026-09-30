#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
verify_script="${root_dir}/scripts/verify-r0.sh"

assert_output_contains() {
  local expected="$1"
  if ! grep -Fq "${expected}" "${verify_script}"; then
    echo "R0 verification must include: ${expected}" >&2
    exit 1
  fi
}

assert_output_contains "typecheck"
assert_output_contains "migration validation"
assert_output_contains "restore drill"
assert_output_contains "E2E approval workflow"
echo "R0 verification script lists all required gates"

#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${root_dir}"

run_gate() {
  local name="$1"
  shift
  printf '== %s ==\n' "${name}"
  "$@"
}

run_gate "typecheck" pnpm typecheck
run_gate "unit and integration tests" pnpm test
run_gate "web production build" pnpm --filter @backoffice/web build
run_gate "migration validation" pnpm --filter @backoffice/db migrate
run_gate "Compose isolation" bash infra/compose/compose-config.test.sh
run_gate "backup and restore script checks" bash infra/backup/restore-verify.test.sh

if [[ -z "${E2E_BASE_URL:-}" ]]; then
  echo "E2E approval workflow: missing E2E_BASE_URL" >&2
  exit 1
fi
run_gate "E2E approval workflow" pnpm --filter @backoffice/web test:e2e

if [[ -z "${BACKUP_FILE:-}" || -z "${BACKUP_ENCRYPTION_KEY_FILE:-}" ]]; then
  echo "restore drill: BACKUP_FILE and BACKUP_ENCRYPTION_KEY_FILE are required" >&2
  exit 1
fi
run_gate "restore drill" bash infra/backup/restore-verify.sh
printf 'R0 verification completed\n'

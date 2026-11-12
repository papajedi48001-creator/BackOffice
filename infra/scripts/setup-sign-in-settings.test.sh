#!/usr/bin/env bash
# setup-sign-in-settings.sh creates a 64-hex key once, keeps it on a second run, and records its path once.
set -euo pipefail
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT
export SECRETS_DIR="${work}/secrets" ENV_FILE="${work}/staging.env" ALLOW_NON_ROOT=1
echo "COMPOSE_PROJECT_NAME=x" > "${ENV_FILE}"
bash "${root_dir}/infra/scripts/setup-sign-in-settings.sh" > "${work}/out1"
key="$(cat "${SECRETS_DIR}/connection_secret_key")"
[[ "${key}" =~ ^[0-9a-f]{64}$ ]] || { echo "key must be 64 hex characters" >&2; exit 1; }
[[ "$(stat -c %a "${SECRETS_DIR}/connection_secret_key")" == "600" ]] || { echo "key must be 0600" >&2; exit 1; }
if grep -q "${key}" "${work}/out1"; then echo "the key must never be printed" >&2; exit 1; fi
bash "${root_dir}/infra/scripts/setup-sign-in-settings.sh" > /dev/null
[[ "$(cat "${SECRETS_DIR}/connection_secret_key")" == "${key}" ]] || { echo "a second run must keep the key" >&2; exit 1; }
[[ "$(grep -c '^CONNECTION_SECRET_KEY_FILE=' "${ENV_FILE}")" == "1" ]] || { echo "the path must be recorded once" >&2; exit 1; }
echo "setup-sign-in-settings keeps one key and records it once"

#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
compose_file="${root_dir}/infra/compose/docker-compose.production.yml"
env_file="${root_dir}/infra/compose/.env.production.example"

assert_no_public_port() {
  local service="$1"
  local rendered
  rendered="$(docker compose --env-file "${env_file}" -f "${compose_file}" config)"
  if printf '%s\n' "${rendered}" | awk -v name="${service}" '
    $0 == "  " name ":" { active=1; next }
    active && /^[^ ]/ { active=0 }
    active { print }
  ' | grep -Eq '^    ports:'; then
    echo "${service} must not publish a port" >&2
    exit 1
  fi
}

assert_no_public_port mariadb
assert_no_public_port redis
assert_no_public_port minio
echo "production data services have no public ports"

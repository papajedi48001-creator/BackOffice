#!/usr/bin/env bash
set -euo pipefail

mode="${1:-validate}"
environment_file="${BACKOFFICE_STAGING_ENV:-/etc/backoffice/staging.env}"
repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [[ ! -r "$environment_file" ]]; then
  echo "Staging environment file is not readable: $environment_file" >&2
  exit 1
fi

# This file is root-controlled and contains configuration paths, not secret values.
set -a
# shellcheck disable=SC1090
source "$environment_file"
set +a

if [[ -z "${COMPOSE_PROJECT_NAME:-}" || -z "${BACKOFFICE_BACKPLANE_SUBNET:-}" ]]; then
  echo 'COMPOSE_PROJECT_NAME and BACKOFFICE_BACKPLANE_SUBNET are required.' >&2
  exit 1
fi

if [[ "$BACKOFFICE_BACKPLANE_SUBNET" == '172.18.0.0/16' ]]; then
  echo 'Refusing 172.18.0.0/16: it overlaps the hospital client network observed during staging.' >&2
  exit 1
fi

compose=(
  docker compose --env-file "$environment_file"
  -f "$repository_root/infra/compose/docker-compose.staging.yml"
  -f "$repository_root/infra/compose/docker-compose.staging-shared-nginx.yml"
  -f "$repository_root/infra/compose/docker-compose.staging-build.yml"
)
network_name="${COMPOSE_PROJECT_NAME}_backplane"

render_config() {
  "${compose[@]}" config >/dev/null
}

existing_subnet() {
  docker network inspect "$network_name" --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null || true
}

ensure_network_is_safe() {
  local subnet
  subnet="$(existing_subnet)"
  if [[ -n "$subnet" && "$subnet" != "$BACKOFFICE_BACKPLANE_SUBNET" ]]; then
    echo "Existing $network_name subnet is $subnet; expected $BACKOFFICE_BACKPLANE_SUBNET." >&2
    echo 'Run: sudo bash infra/scripts/staging-network.sh reset-network' >&2
    exit 2
  fi
}

case "$mode" in
  validate)
    render_config
    echo "Compose configuration is valid for $BACKOFFICE_BACKPLANE_SUBNET."
    ;;
  reset-network)
    "${compose[@]}" down
    if docker network inspect "$network_name" >/dev/null 2>&1; then
      echo "Staging network still exists: $network_name" >&2
      exit 3
    fi
    echo 'Staging containers and network stopped. Named volumes were retained.'
    ;;
  start-core)
    render_config
    ensure_network_is_safe
    "${compose[@]}" up -d mariadb redis minio
    echo 'Started staging MariaDB, Redis, and MinIO only.'
    ;;
  *)
    echo "Usage: $0 {validate|reset-network|start-core}" >&2
    exit 64
    ;;
esac

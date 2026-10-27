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
assert_no_public_port seaweedfs
assert_no_public_port clamav
echo "production data services have no public ports"

rendered="$(docker compose --env-file "${env_file}" -f "${compose_file}" config --format json)"
if printf '%s' "${rendered}" | grep -qi minio; then
  echo "production compose must not mention MinIO" >&2
  exit 1
fi
node -e '
  const { services, networks } = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const fail = (message) => { console.error(message); process.exit(1); };
  const env = services.web.environment;
  if (env.S3_ENDPOINT !== "http://seaweedfs:8333") fail("web must use SeaweedFS S3 at http://seaweedfs:8333");
  if (env.CLAMD_HOST !== "clamav" || env.CLAMD_PORT !== "3310") fail("web must scan uploads with clamav:3310");
  if (env.S3_ACCESS_KEY_ID_FILE !== "/run/secrets/s3_access_key_id" || env.S3_SECRET_ACCESS_KEY_FILE !== "/run/secrets/s3_secret_access_key") fail("web must read its S3 keys from secret files");
  const secrets = services.web.secrets.map((secret) => secret.source);
  for (const name of ["s3_access_key_id", "s3_secret_access_key"]) if (!secrets.includes(name)) fail(`web must mount the ${name} secret`);
  if (!services.seaweedfs.secrets.some((secret) => secret.source === "seaweedfs_s3_config")) fail("seaweedfs must read its identities from a secret");
  if (!Object.keys(services.clamav.networks).some((name) => !networks[name].internal)) fail("clamav needs a network with outbound access for signature updates");
  if (Object.keys(services.seaweedfs.networks).some((name) => !networks[name].internal)) fail("seaweedfs must stay on internal networks only");
' <<< "${rendered}"
echo "web stores attachments in SeaweedFS and scans them with ClamAV"
docker compose --env-file "${root_dir}/infra/compose/.env.staging.example" -f "${root_dir}/infra/compose/docker-compose.staging.yml" config --quiet
echo "staging compose renders"

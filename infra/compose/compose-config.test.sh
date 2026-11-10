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
  const on = (service) => Object.keys(services[service].networks ?? {}).sort().join(",");
  if (on("seaweedfs") !== "storage") fail("seaweedfs must sit only on the storage network");
  if (on("clamav") !== "scan,updates") fail("clamav must sit only on the scan network and the updates network");
  for (const name of ["storage", "scan"]) if (!networks[name].internal) fail(`${name} must be an internal network`);
  for (const [name, service] of Object.entries(services)) {
    const joined = Object.keys(service.networks ?? {});
    if (joined.includes("storage") && !["web", "seaweedfs"].includes(name)) fail(`${name} must not reach SeaweedFS`);
    if (joined.includes("scan") && !["web", "clamav"].includes(name)) fail(`${name} must not reach ClamAV`);
  }
  if (!on("web").includes("storage") || !on("web").includes("scan")) fail("web must reach both SeaweedFS and ClamAV");
  const command = services.seaweedfs.command.join(" ");
  if (!command.includes("-ip.bind=127.0.0.1") || !command.includes("-s3.ip.bind=0.0.0.0")) fail("seaweedfs must keep master, volume and filer on loopback and expose only S3");
' <<< "${rendered}"
echo "web stores attachments in SeaweedFS and scans them with ClamAV"
env_without_database_url="$(mktemp)"
grep -v '^DATABASE_URL_FILE=' "${env_file}" > "${env_without_database_url}"
rendered="$(docker compose --env-file "${env_without_database_url}" -f "${compose_file}" config --format json)"
node -e '
  const { services, volumes } = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const fail = (message) => { console.error(message); process.exit(1); };
  const mount = (name) => (services[name].volumes ?? []).find((volume) => volume.target === "/var/lib/backoffice/config");
  if (!volumes["backoffice-config"]) fail("production compose must declare the backoffice-config volume");
  if (mount("web")?.source !== "backoffice-config" || mount("web").read_only) fail("web must mount backoffice-config read-write at /var/lib/backoffice/config");
  if (mount("worker")?.source !== "backoffice-config" || !mount("worker").read_only) fail("worker must mount backoffice-config read-only at /var/lib/backoffice/config");
  for (const name of ["web", "worker"]) if (services[name].environment.DATABASE_URL_FILE) fail(`${name} must find its database URL in the config volume by default`);
' <<< "${rendered}"
echo "web and worker read the database URL from the setup config volume"

rendered="$(docker compose --env-file "${env_without_database_url}" -f "${compose_file}" -f "${root_dir}/infra/compose/docker-compose.external-db.yml" config --format json)"
node -e '
  const { services, networks } = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const fail = (message) => { console.error(message); process.exit(1); };
  if (services.mariadb) fail("the external database override must not start the bundled mariadb");
  if (!networks.database || networks.database.internal) fail("the external database override needs a non-internal database network");
  for (const name of ["web", "worker"]) if (!Object.keys(services[name].networks ?? {}).includes("database")) fail(`${name} must join the database network`);
  if (Object.keys(services.web.networks).length !== 4) fail("web must keep its backplane, storage and scan networks");
' <<< "${rendered}"
echo "external database override reaches a database outside compose"

rendered="$(docker compose --env-file "${env_file}" -f "${compose_file}" -f "${root_dir}/infra/compose/docker-compose.database-url-secret.yml" config --format json)"
node -e '
  const { services } = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const fail = (message) => { console.error(message); process.exit(1); };
  for (const name of ["web", "worker"]) {
    if (services[name].environment.DATABASE_URL_FILE !== "/run/secrets/database_url") fail(`${name} must read DATABASE_URL_FILE from the secret with the override`);
    if (!services[name].secrets.some((secret) => secret.source === "database_url")) fail(`${name} must mount the database_url secret with the override`);
  }
' <<< "${rendered}"
echo "the database URL secret override still works"
rm -f "${env_without_database_url}"

rendered="$(docker compose --env-file "${root_dir}/infra/compose/.env.staging.example" -f "${root_dir}/infra/compose/docker-compose.staging.yml" config --format json)"
node -e '
  const { services } = JSON.parse(require("fs").readFileSync(0, "utf8"));
  for (const name of ["web", "worker"]) if (services[name].environment.DATABASE_URL_FILE !== "/run/secrets/database_url") { console.error(`staging ${name} must keep reading the database_url secret`); process.exit(1); }
' <<< "${rendered}"
echo "staging compose renders"

# เข้าสู่ระบบด้วย Provider ID stays off unless the operator adds docker-compose.provider-sso.yml.
rendered="$(docker compose --env-file "${env_file}" -f "${compose_file}" config --format json)"
node -e '
  const { services } = JSON.parse(require("fs").readFileSync(0, "utf8"));
  if (Object.keys(services.web.environment).some((key) => key.startsWith("PROVIDER_SSO_"))) { console.error("Provider ID sign-in must stay off without the provider-sso override"); process.exit(1); }
' <<< "${rendered}"
provider_env="$(mktemp)"
cat "${env_file}" > "${provider_env}"
cat >> "${provider_env}" <<'ENV'
PROVIDER_SSO_ISSUER=https://aut-waritch-hosp.moph.go.th
PROVIDER_SSO_REDIRECT_URI=https://office-waritch-hosp.moph.go.th/api/auth/provider/callback
PROVIDER_SSO_CLIENT_SECRET_FILE=/etc/backoffice/secrets/provider_sso_client_secret
BACKOFFICE_PORTAL_SUBNET=10.250.255.0/24
ENV
for overrides in "" "${root_dir}/infra/compose/docker-compose.staging-shared-nginx.yml"; do
  files=(-f "${compose_file}")
  if [[ -n "${overrides}" ]]; then files=(-f "${root_dir}/infra/compose/docker-compose.staging.yml" -f "${overrides}"); fi
  env_for_run="${provider_env}"
  if [[ -n "${overrides}" ]]; then env_for_run="$(mktemp)"; cat "${root_dir}/infra/compose/.env.staging.example" "${provider_env}" | grep -v '^COMPOSE_PROJECT_NAME=waritch-backoffice-production' > "${env_for_run}"; fi
  rendered="$(docker compose --env-file "${env_for_run}" "${files[@]}" -f "${root_dir}/infra/compose/docker-compose.provider-sso.yml" config --format json)"
  node -e '
    const { services, networks, secrets } = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const fail = (message) => { console.error(message); process.exit(1); };
    const env = services.web.environment;
    if (env.PROVIDER_SSO_ISSUER !== "https://aut-waritch-hosp.moph.go.th") fail("web must receive PROVIDER_SSO_ISSUER");
    if (env.PROVIDER_SSO_CLIENT_ID !== "backoffice") fail("web must default PROVIDER_SSO_CLIENT_ID to backoffice");
    if (env.PROVIDER_SSO_REDIRECT_URI !== "https://office-waritch-hosp.moph.go.th/api/auth/provider/callback") fail("web must receive PROVIDER_SSO_REDIRECT_URI");
    if (env.PROVIDER_SSO_CLIENT_SECRET_FILE !== "/run/secrets/provider_sso_client_secret" || env.PROVIDER_SSO_CLIENT_SECRET) fail("web must read the client secret only from the secret file");
    if (!services.web.secrets.some((secret) => secret.source === "provider_sso_client_secret")) fail("web must mount the provider_sso_client_secret secret");
    if (secrets.provider_sso_client_secret?.file !== "/etc/backoffice/secrets/provider_sso_client_secret") fail("the secret must come from PROVIDER_SSO_CLIENT_SECRET_FILE");
    if (!services.web.secrets.some((secret) => secret.source === "session_secret")) fail("web must keep its other secrets");
    const joined = Object.keys(services.web.networks ?? {});
    if (!joined.includes("portal") || networks.portal.internal) fail("web must join a non-internal portal network to reach the portal");
    // An unpinned network may get 172.18.0.0/16 from Docker, which overlaps the hospital client network.
    if (networks.portal.ipam?.config?.[0]?.subnet !== "10.250.255.0/24") fail("the portal network must use BACKOFFICE_PORTAL_SUBNET");
    for (const name of ["backplane", "storage", "scan"]) if (!joined.includes(name)) fail(`web must keep the ${name} network`);
    for (const [name, service] of Object.entries(services)) if (name !== "web" && Object.keys(service.networks ?? {}).includes("portal")) fail(`${name} must not join the portal network`);
    if (!(services.web.extra_hosts ?? []).some((entry) => /^aut-waritch-hosp\.moph\.go\.th[:=]192\.168\.1\.10$/.test(entry))) fail("web must resolve the portal host to 192.168.1.10");
  ' <<< "${rendered}"
  if [[ "${env_for_run}" != "${provider_env}" ]]; then rm -f "${env_for_run}"; fi
done
rm -f "${provider_env}"
echo "the provider-sso override turns on Provider ID sign-in and reaches the portal"

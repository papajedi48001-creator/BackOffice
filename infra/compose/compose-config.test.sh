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
  if (Object.keys(services.web.environment).some((key) => key.startsWith("PROVIDER_ID_"))) { console.error("Provider ID sign-in must stay off without the provider-sso override"); process.exit(1); }
' <<< "${rendered}"
provider_env="$(mktemp)"
cat "${env_file}" > "${provider_env}"
cat >> "${provider_env}" <<'ENV'
PROVIDER_ID_HEALTH_CLIENT_ID=health-client-id
PROVIDER_ID_CLIENT_ID=provider-client-id
PROVIDER_ID_REDIRECT_URI=https://office-waritch-hosp.moph.go.th/api/auth/provider/callback
PROVIDER_ID_HEALTH_CLIENT_SECRET_FILE=/etc/backoffice/secrets/provider_id_health_client_secret
PROVIDER_ID_SECRET_KEY_FILE=/etc/backoffice/secrets/provider_id_secret_key
BACKOFFICE_EGRESS_SUBNET=10.250.255.0/24
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
    if (env.PROVIDER_ID_ENV !== "prd") fail("web must default PROVIDER_ID_ENV to prd");
    if (env.PROVIDER_ID_HEALTH_CLIENT_ID !== "health-client-id" || env.PROVIDER_ID_CLIENT_ID !== "provider-client-id") fail("web must receive both client IDs");
    if (env.PROVIDER_ID_REDIRECT_URI !== "https://office-waritch-hosp.moph.go.th/api/auth/provider/callback") fail("web must receive PROVIDER_ID_REDIRECT_URI");
    if (env.PROVIDER_ID_HEALTH_CLIENT_SECRET_FILE !== "/run/secrets/provider_id_health_client_secret" || env.PROVIDER_ID_HEALTH_CLIENT_SECRET) fail("web must read the MOPH ID secret only from the secret file");
    if (env.PROVIDER_ID_SECRET_KEY_FILE !== "/run/secrets/provider_id_secret_key" || env.PROVIDER_ID_SECRET_KEY) fail("web must read the Provider ID secret key only from the secret file");
    if (env.PROVIDER_ID_HEALTH_URL || env.PROVIDER_ID_API_URL) fail("the stub base-URL overrides must never reach a deployed web");
    if (!("PASSWORD_SIGN_IN" in env) || env.PASSWORD_SIGN_IN !== "") fail("web must receive PASSWORD_SIGN_IN, empty (password sign-in closed) unless the operator sets it");
    for (const [name, file] of [["provider_id_health_client_secret", "/etc/backoffice/secrets/provider_id_health_client_secret"], ["provider_id_secret_key", "/etc/backoffice/secrets/provider_id_secret_key"]]) {
      if (!services.web.secrets.some((secret) => secret.source === name)) fail(`web must mount the ${name} secret`);
      if (secrets[name]?.file !== file) fail(`the ${name} secret must come from its _FILE setting`);
    }
    if (!services.web.secrets.some((secret) => secret.source === "session_secret")) fail("web must keep its other secrets");
    const joined = Object.keys(services.web.networks ?? {});
    if (!joined.includes("egress") || networks.egress.internal) fail("web must join a non-internal egress network to reach MOPH ID and Provider ID");
    // An unpinned network may get 172.18.0.0/16 from Docker, which overlaps the hospital client network.
    if (networks.egress.ipam?.config?.[0]?.subnet !== "10.250.255.0/24") fail("the egress network must use BACKOFFICE_EGRESS_SUBNET");
    for (const name of ["backplane", "storage", "scan"]) if (!joined.includes(name)) fail(`web must keep the ${name} network`);
    for (const [name, service] of Object.entries(services)) if (name !== "web" && Object.keys(service.networks ?? {}).includes("egress")) fail(`${name} must not join the egress network`);
    if ((services.web.extra_hosts ?? []).length) fail("web must resolve the ministry hosts through DNS, not a pinned address");
  ' <<< "${rendered}"
  if [[ "${env_for_run}" != "${provider_env}" ]]; then rm -f "${env_for_run}"; fi
done
echo "the provider-sso override turns on Provider ID sign-in and reaches MOPH ID"

# The portal's photo requests need the portal issuer (for its JWKS) only when the operator also adds docker-compose.portal-photo.yml.
rendered="$(docker compose --env-file "${provider_env}" -f "${compose_file}" -f "${root_dir}/infra/compose/docker-compose.provider-sso.yml" config --format json)"
node -e '
  const { services } = JSON.parse(require("fs").readFileSync(0, "utf8"));
  if (Object.keys(services.web.environment).some((key) => key.startsWith("PROVIDER_SSO_"))) { console.error("portal photo settings must stay off without the portal-photo override"); process.exit(1); }
' <<< "${rendered}"
photo_env="$(mktemp)"
cat "${provider_env}" > "${photo_env}"
echo "PROVIDER_SSO_ISSUER=https://aut-waritch-hosp.moph.go.th" >> "${photo_env}"
rendered="$(docker compose --env-file "${photo_env}" -f "${compose_file}" -f "${root_dir}/infra/compose/docker-compose.provider-sso.yml" -f "${root_dir}/infra/compose/docker-compose.portal-photo.yml" config --format json)"
node -e '
  const { services } = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const fail = (message) => { console.error(message); process.exit(1); };
  const env = services.web.environment;
  if (env.PROVIDER_SSO_ISSUER !== "https://aut-waritch-hosp.moph.go.th" || env.PROVIDER_SSO_CLIENT_ID !== "backoffice") fail("web must receive the portal issuer and client id");
  if (env.PROVIDER_SSO_CLIENT_SECRET || env.PROVIDER_SSO_CLIENT_SECRET_FILE || env.PROVIDER_SSO_REDIRECT_URI) fail("photo requests must not need a portal secret or redirect URI");
  if (!(services.web.extra_hosts ?? []).some((entry) => /^aut-waritch-hosp\.moph\.go\.th[:=]192\.168\.1\.10$/.test(entry))) fail("web must reach the portal at its LAN address");
  if (!Object.keys(services.web.networks ?? {}).includes("egress")) fail("web must reach the portal over the egress network");
  for (const [name, service] of Object.entries(services)) if (name !== "web" && Object.keys(service.environment ?? {}).some((key) => key.startsWith("PROVIDER_SSO_"))) fail(`${name} must not receive portal settings`);
' <<< "${rendered}"
rm -f "${photo_env}" "${provider_env}"
echo "the portal-photo override lets web check the portal's photo requests"

# Secrets typed on the web stay unstorable unless the operator adds docker-compose.sign-in-settings.yml.
rendered="$(docker compose --env-file "${env_file}" -f "${compose_file}" config --format json)"
node -e '
  const { services } = JSON.parse(require("fs").readFileSync(0, "utf8"));
  for (const name of ["web", "worker"]) if (Object.keys(services[name].environment ?? {}).some((key) => key.startsWith("CONNECTION_SECRET_KEY"))) { console.error(`${name} must not receive CONNECTION_SECRET_KEY without the sign-in-settings override`); process.exit(1); }
' <<< "${rendered}"
key_env="$(mktemp)"
cat "${env_file}" > "${key_env}"
echo "CONNECTION_SECRET_KEY_FILE=/etc/backoffice/secrets/connection_secret_key" >> "${key_env}"
rendered="$(docker compose --env-file "${key_env}" -f "${compose_file}" -f "${root_dir}/infra/compose/docker-compose.sign-in-settings.yml" config --format json)"
node -e '
  const { services, secrets } = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const fail = (message) => { console.error(message); process.exit(1); };
  for (const name of ["web", "worker"]) {
    const env = services[name].environment;
    if (env.CONNECTION_SECRET_KEY_FILE !== "/run/secrets/connection_secret_key" || env.CONNECTION_SECRET_KEY) fail(`${name} must read CONNECTION_SECRET_KEY only from the secret file`);
    if (!services[name].secrets.some((secret) => secret.source === "connection_secret_key")) fail(`${name} must mount the connection_secret_key secret`);
  }
  if (secrets.connection_secret_key.file !== "/etc/backoffice/secrets/connection_secret_key") fail("the key must come from /etc/backoffice/secrets");
' <<< "${rendered}"
rm -f "${key_env}"
echo "the sign-in-settings override lets web and worker keep secrets typed on the web"

# การแจ้งเตือน LINE stays off unless the operator adds docker-compose.line.yml (docs/runbooks/line-alert.md).
rendered="$(docker compose --env-file "${env_file}" -f "${compose_file}" config --format json)"
node -e '
  const { services } = JSON.parse(require("fs").readFileSync(0, "utf8"));
  for (const name of ["web", "worker"]) if (Object.keys(services[name].environment ?? {}).some((key) => key.startsWith("LINE_"))) { console.error(`${name} must not receive LINE settings without the line override`); process.exit(1); }
' <<< "${rendered}"
line_env="$(mktemp)"
cat "${env_file}" > "${line_env}"
cat >> "${line_env}" <<'ENV'
LINE_CHANNEL_ACCESS_TOKEN_FILE=/etc/backoffice/secrets/line_channel_access_token
LINE_CHANNEL_SECRET_FILE=/etc/backoffice/secrets/line_channel_secret
LINE_BOT_BASIC_ID=@123abcd
BACKOFFICE_PUBLIC_URL=https://office-waritch-hosp.moph.go.th
BACKOFFICE_EGRESS_SUBNET=10.250.255.0/24
ENV
for overrides in "" "${root_dir}/infra/compose/docker-compose.staging-shared-nginx.yml"; do
  files=(-f "${compose_file}")
  env_for_run="${line_env}"
  if [[ -n "${overrides}" ]]; then
    files=(-f "${root_dir}/infra/compose/docker-compose.staging.yml" -f "${overrides}")
    env_for_run="$(mktemp)"; cat "${root_dir}/infra/compose/.env.staging.example" "${line_env}" | grep -v '^COMPOSE_PROJECT_NAME=waritch-backoffice-production' > "${env_for_run}"
  fi
  rendered="$(docker compose --env-file "${env_for_run}" "${files[@]}" -f "${root_dir}/infra/compose/docker-compose.line.yml" config --format json)"
  node -e '
    const { services, networks, secrets } = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const fail = (message) => { console.error(message); process.exit(1); };
    for (const name of ["web", "worker"]) {
      const env = services[name].environment;
      if (env.LINE_CHANNEL_ACCESS_TOKEN_FILE !== "/run/secrets/line_channel_access_token" || env.LINE_CHANNEL_ACCESS_TOKEN) fail(`${name} must read the LINE access token only from the secret file`);
      if (env.LINE_CHANNEL_SECRET_FILE !== "/run/secrets/line_channel_secret" || env.LINE_CHANNEL_SECRET) fail(`${name} must read the LINE channel secret only from the secret file`);
      if (env.LINE_BOT_BASIC_ID !== "@123abcd") fail(`${name} must receive LINE_BOT_BASIC_ID`);
      if (env.BACKOFFICE_PUBLIC_URL !== "https://office-waritch-hosp.moph.go.th") fail(`${name} must receive BACKOFFICE_PUBLIC_URL for links in messages`);
      for (const secret of ["line_channel_access_token", "line_channel_secret"]) if (!services[name].secrets.some((s) => s.source === secret)) fail(`${name} must mount the ${secret} secret`);
      if (!env.BACKOFFICE_CONFIG_DIR && !env.DATABASE_URL_FILE) fail(`${name} must keep its own settings`);
    }
    if (!services.web.secrets.some((s) => s.source === "session_secret")) fail("web must keep its other secrets");
    for (const [name, file] of [["line_channel_access_token", "/etc/backoffice/secrets/line_channel_access_token"], ["line_channel_secret", "/etc/backoffice/secrets/line_channel_secret"]]) if (secrets[name]?.file !== file) fail(`the ${name} secret must come from its _FILE setting`);
    // The worker pushes to api.line.me; it needs the same pinned, non-internal egress network the web uses for MOPH ID.
    const workerNetworks = Object.keys(services.worker.networks ?? {});
    if (!workerNetworks.includes("egress") || networks.egress.internal) fail("worker must join a non-internal egress network to reach api.line.me");
    if (networks.egress.ipam?.config?.[0]?.subnet !== "10.250.255.0/24") fail("the egress network must use BACKOFFICE_EGRESS_SUBNET");
    if (!workerNetworks.includes("backplane")) fail("worker must keep the backplane network");
    for (const name of ["mariadb", "redis", "seaweedfs", "clamav"]) if (Object.keys(services[name]?.networks ?? {}).includes("egress")) fail(`${name} must not join the egress network`);
  ' <<< "${rendered}"
  if [[ "${env_for_run}" != "${line_env}" ]]; then rm -f "${env_for_run}"; fi
done
rm -f "${line_env}"
echo "the line override lets web and worker send LINE alerts"

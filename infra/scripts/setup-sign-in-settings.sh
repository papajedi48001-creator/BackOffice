#!/usr/bin/env bash
# Run once as root on the BackOffice host (.251): creates the key that seals secrets typed at ผู้ดูแลระบบ > การเข้าสู่ระบบ
# and records its path for docker-compose.sign-in-settings.yml. Safe to run again: an existing key is never replaced,
# because replacing it makes every saved secret unreadable. Prints no secret.
set -euo pipefail

secrets_dir="${SECRETS_DIR:-/etc/backoffice/secrets}"
env_file="${ENV_FILE:-/etc/backoffice/staging.env}"
key_file="${secrets_dir}/connection_secret_key"

if [[ "$(id -u)" != "0" && -z "${ALLOW_NON_ROOT:-}" ]]; then echo "run as root (sudo -i)" >&2; exit 1; fi
install -d -m 700 "${secrets_dir}"
if [[ -s "${key_file}" ]]; then
  echo "key already present: ${key_file} (kept)"
else
  umask 077
  openssl rand -hex 32 > "${key_file}"
  echo "created ${key_file}"
fi
chmod 600 "${key_file}"
[[ "$(id -u)" == "0" ]] && chown root:root "${key_file}"
if grep -q '^CONNECTION_SECRET_KEY_FILE=' "${env_file}" 2>/dev/null; then
  sed -i "s#^CONNECTION_SECRET_KEY_FILE=.*#CONNECTION_SECRET_KEY_FILE=${key_file}#" "${env_file}"
else
  echo "CONNECTION_SECRET_KEY_FILE=${key_file}" >> "${env_file}"
fi
echo "set CONNECTION_SECRET_KEY_FILE in ${env_file}"
echo "next: deploy with -f infra/compose/docker-compose.sign-in-settings.yml added after the provider-sso override"

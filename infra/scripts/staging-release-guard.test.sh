#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
guard="${root_dir}/infra/scripts/staging-release-guard.sh"
temp_dir="$(mktemp -d)"
trap 'rm -rf "${temp_dir}"' EXIT

release_id="6523964"
release_dir="${temp_dir}/releases/${release_id}"
current_link="${temp_dir}/current"
mkdir -p "${release_dir}/apps/web/src/app/api/notifications"
touch "${release_dir}/apps/web/src/app/api/notifications/route.ts"
mkdir -p "${current_link}"

assert_succeeds() {
  if ! "$@" >"${temp_dir}/stdout" 2>"${temp_dir}/stderr"; then
    cat "${temp_dir}/stdout" >&2
    cat "${temp_dir}/stderr" >&2
    echo "expected command to succeed" >&2
    exit 1
  fi
}

assert_fails_with() {
  local expected="$1"
  shift
  if "$@" >"${temp_dir}/stdout" 2>"${temp_dir}/stderr"; then
    echo "expected command to fail" >&2
    exit 1
  fi
  if ! grep -Fq "${expected}" "${temp_dir}/stderr"; then
    cat "${temp_dir}/stderr" >&2
    echo "expected failure containing: ${expected}" >&2
    exit 1
  fi
}

run_prebuild() {
  local directory="$1"
  local web_image="$2"
  local worker_image="$3"
  (
    cd "${directory}"
    bash "${guard}" prebuild \
      --release-id "${release_id}" \
      --release-dir "${release_dir}" \
      --web-image "${web_image}" \
      --worker-image "${worker_image}" \
      --required-source-file "apps/web/src/app/api/notifications/route.ts"
  )
}

docker() {
  local invocation="$*"
  if [[ "${invocation}" == *"waritch-backoffice/web:${release_id}"* && "${invocation}" == *"api/notifications/route.js"* && "${FAKE_WEB_ARTIFACT:-present}" == "present" ]]; then
    return 0
  fi
  if [[ "${invocation}" == *"waritch-backoffice/worker:${release_id}"* && "${invocation}" == *"apps/worker/src/main.ts"* && "${FAKE_WORKER_ARTIFACT:-present}" == "present" ]]; then
    return 0
  fi
  return 1
}
export -f docker

readlink() {
  if [[ "$1" == "-f" ]]; then
    printf '%s\n' "${FAKE_CURRENT_TARGET}"
    return 0
  fi
  command readlink "$@"
}
export FAKE_CURRENT_TARGET="${release_dir}"
export -f readlink

run_postbuild() {
  (
    cd "${release_dir}"
    bash "${guard}" postbuild \
      --release-id "${release_id}" \
      --release-dir "${release_dir}" \
      --web-image "waritch-backoffice/web:${release_id}" \
      --worker-image "waritch-backoffice/worker:${release_id}" \
      --required-web-artifact "/app/apps/web/.next/server/app/api/notifications/route.js" \
      --required-worker-artifact "/app/apps/worker/src/main.ts"
  )
}

run_active() {
  (
    cd "${release_dir}"
    bash "${guard}" active \
      --release-id "${release_id}" \
      --release-dir "${release_dir}" \
      --web-image "waritch-backoffice/web:${release_id}" \
      --worker-image "waritch-backoffice/worker:${release_id}" \
      --current-link "${current_link}"
  )
}

assert_succeeds run_prebuild "${release_dir}" \
  "waritch-backoffice/web:${release_id}" \
  "waritch-backoffice/worker:${release_id}"

assert_fails_with "release directory mismatch" run_prebuild "${temp_dir}" \
  "waritch-backoffice/web:${release_id}" \
  "waritch-backoffice/worker:${release_id}"

assert_fails_with "web image tag must end with :${release_id}" run_prebuild "${release_dir}" \
  "waritch-backoffice/web:f3a7221" \
  "waritch-backoffice/worker:${release_id}"

assert_succeeds run_postbuild

FAKE_WEB_ARTIFACT=missing assert_fails_with "web image is missing required artifact" run_postbuild

assert_succeeds run_active
FAKE_CURRENT_TARGET="${temp_dir}/releases/f3a7221"
export FAKE_CURRENT_TARGET
assert_fails_with "current link mismatch" run_active

echo "staging release guard passed"

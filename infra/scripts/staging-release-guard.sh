#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "release guard: $*" >&2
  exit 1
}

usage() {
  cat >&2 <<'EOF'
usage: staging-release-guard.sh prebuild --release-id ID --release-dir DIR --web-image IMAGE --worker-image IMAGE --required-source-file PATH
       staging-release-guard.sh postbuild --release-id ID --release-dir DIR --web-image IMAGE --worker-image IMAGE --required-web-artifact PATH --required-worker-artifact PATH
       staging-release-guard.sh active --release-id ID --release-dir DIR --web-image IMAGE --worker-image IMAGE --current-link PATH
EOF
  exit 2
}

command_name="${1:-}"
[[ "${command_name}" == "prebuild" || "${command_name}" == "postbuild" || "${command_name}" == "active" ]] || usage
shift

release_id=""
release_dir=""
web_image=""
worker_image=""
required_source_file=""
required_web_artifact=""
required_worker_artifact=""
current_link=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --release-id) release_id="${2:-}"; shift 2 ;;
    --release-dir) release_dir="${2:-}"; shift 2 ;;
    --web-image) web_image="${2:-}"; shift 2 ;;
    --worker-image) worker_image="${2:-}"; shift 2 ;;
    --required-source-file) required_source_file="${2:-}"; shift 2 ;;
    --required-web-artifact) required_web_artifact="${2:-}"; shift 2 ;;
    --required-worker-artifact) required_worker_artifact="${2:-}"; shift 2 ;;
    --current-link) current_link="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done

[[ -n "${release_id}" && -n "${release_dir}" && -n "${web_image}" && -n "${worker_image}" ]] || usage
[[ -d "${release_dir}" ]] || fail "release directory does not exist: ${release_dir}"

canonical_release_dir="$(cd "${release_dir}" && pwd -P)"
canonical_working_dir="$(pwd -P)"
[[ "${canonical_working_dir}" == "${canonical_release_dir}" ]] || fail "release directory mismatch: run from ${canonical_release_dir}"
[[ "$(basename "${canonical_release_dir}")" == "${release_id}" ]] || fail "release directory name must be ${release_id}"
[[ "${web_image}" == *":${release_id}" ]] || fail "web image tag must end with :${release_id}"
[[ "${worker_image}" == *":${release_id}" ]] || fail "worker image tag must end with :${release_id}"
if [[ "${command_name}" == "prebuild" ]]; then
  [[ -n "${required_source_file}" ]] || usage
  [[ -f "${canonical_release_dir}/${required_source_file}" ]] || fail "required source file is missing: ${required_source_file}"
  echo "PREBUILD_OK release=${release_id}"
  exit 0
fi

if [[ "${command_name}" == "active" ]]; then
  [[ -n "${current_link}" ]] || usage
  [[ -e "${current_link}" || -L "${current_link}" ]] || fail "current link does not exist: ${current_link}"
  canonical_current_target="$(readlink -f -- "${current_link}")"
  [[ "${canonical_current_target}" == "${canonical_release_dir}" ]] || fail "current link mismatch: expected ${canonical_release_dir}"
  echo "ACTIVE_OK release=${release_id}"
  exit 0
fi

[[ -n "${required_web_artifact}" && -n "${required_worker_artifact}" ]] || usage
[[ "${required_web_artifact}" =~ ^/[A-Za-z0-9._/-]+$ ]] || fail "invalid web artifact path"
[[ "${required_worker_artifact}" =~ ^/[A-Za-z0-9._/-]+$ ]] || fail "invalid worker artifact path"

docker_bin="${DOCKER_BIN:-docker}"
if ! "${docker_bin}" run --rm --entrypoint sh "${web_image}" -lc "test -f '${required_web_artifact}'" >/dev/null 2>&1; then
  fail "web image is missing required artifact: ${required_web_artifact}"
fi
if ! "${docker_bin}" run --rm --entrypoint sh "${worker_image}" -lc "test -f '${required_worker_artifact}'" >/dev/null 2>&1; then
  fail "worker image is missing required artifact: ${required_worker_artifact}"
fi

echo "POSTBUILD_OK release=${release_id}"

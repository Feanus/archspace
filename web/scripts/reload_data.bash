#!/usr/bin/env bash

set -euo pipefail

export https_proxy=http://127.0.0.1:7897 http_proxy=http://127.0.0.1:7897 all_proxy=socks5://127.0.0.1:7897

if [[ -z "${GITHUB_TOKEN:-}" && -z "${GH_TOKEN:-}" ]]; then
  echo "Set GITHUB_TOKEN or GH_TOKEN in the environment before running this script." >&2
  exit 1
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/../.." && pwd)"
raw_data="${script_dir}/template-test-data.json"

node "${script_dir}/github-template-test-fetcher-v3.mjs" > "${raw_data}"

node "${script_dir}/build-template-test-data-v2.mjs" \
  "${raw_data}" \
  "${repo_root}/data/template-test-data.json"

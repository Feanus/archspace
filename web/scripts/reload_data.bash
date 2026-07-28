#!/usr/bin/env bash

set -euo pipefail

export https_proxy=http://127.0.0.1:7897 http_proxy=http://127.0.0.1:7897 all_proxy=socks5://127.0.0.1:7897

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/../.." && pwd)"
raw_data="$(mktemp "${TMPDIR:-/tmp}/template-test-raw.XXXXXX.json")"

cleanup() {
  node -e 'require("fs").unlinkSync(process.argv[1])' "${raw_data}"
}
trap cleanup EXIT

node "${script_dir}/github-template-test-fetcher-v4.mjs" \
  RmZeta2718 arch-test \
  > "${raw_data}"

node "${script_dir}/build-template-test-data-v2.mjs" \
  "${raw_data}" \
  "${repo_root}/data/template-test-data.json"

node "${script_dir}/build-template-test-data-v2.mjs" \
  "${raw_data}" \
  "${script_dir}/template-test-data.json"

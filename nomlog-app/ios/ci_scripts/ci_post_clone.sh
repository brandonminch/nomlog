#!/bin/bash
# Xcode Cloud: runs after clone. Installs JS deps + CocoaPods.
# Canonical copy lives in nomlog-app/xcode-cloud-ci/; expo prebuild copies this to ios/ci_scripts/.
set -euo pipefail

export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_ROOT="$(cd "$IOS_DIR/.." && pwd)"

echo "[ci_post_clone] IOS_DIR=$IOS_DIR APP_ROOT=$APP_ROOT"

cd "$APP_ROOT"

NOMLOG_CI_NODE_VERSION="${NOMLOG_CI_NODE_VERSION:-20.18.1}"

ensure_node() {
  if command -v node >/dev/null 2>&1; then
    echo "[ci_post_clone] node: $(command -v node) ($(node -v))"
    return 0
  fi

  local arch node_arch
  arch="$(uname -m)"
  case "$arch" in
    arm64) node_arch="arm64" ;;
    x86_64) node_arch="x64" ;;
    *) node_arch="arm64" ;;
  esac

  local base="${TMPDIR:-/tmp}/nomlog-node-v${NOMLOG_CI_NODE_VERSION}-${node_arch}"
  mkdir -p "$base"
  if [[ ! -x "$base/bin/node" ]]; then
    local url="https://nodejs.org/dist/v${NOMLOG_CI_NODE_VERSION}/node-v${NOMLOG_CI_NODE_VERSION}-darwin-${node_arch}.tar.gz"
    echo "[ci_post_clone] installing Node ${NOMLOG_CI_NODE_VERSION} from ${url}"
    curl -fsSL "$url" | tar xz -C "$base" --strip-components=1
  fi
  export PATH="$base/bin:$PATH"
  echo "[ci_post_clone] node: $(command -v node) ($(node -v))"
}

ensure_yarn_install() {
  if command -v yarn >/dev/null 2>&1; then
    yarn install --frozen-lockfile || yarn install
    return 0
  fi

  if command -v corepack >/dev/null 2>&1; then
    corepack enable || true
    if corepack prepare yarn@1.22.22 --activate 2>/dev/null; then
      yarn install --frozen-lockfile || yarn install
      return 0
    fi
  fi

  if command -v npm >/dev/null 2>&1; then
    npm install -g yarn@1.22.22 || true
  fi

  if command -v yarn >/dev/null 2>&1; then
    yarn install --frozen-lockfile || yarn install
  else
    npx --yes yarn@1.22.22 install --frozen-lockfile || npx --yes yarn@1.22.22 install
  fi
}

ensure_node
ensure_yarn_install

cd "$IOS_DIR"
pod install --repo-update

echo "[ci_post_clone] done"

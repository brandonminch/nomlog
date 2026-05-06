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

NOMLOG_CI_NODE_VERSION="${NOMLOG_CI_NODE_VERSION:-20.18.1}"
PNPM_VERSION="${PNPM_VERSION:-9.15.9}"

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

monorepo_root_from() {
  local dir="$1"
  while [[ "$dir" != "/" ]]; do
    if [[ -f "$dir/pnpm-workspace.yaml" ]]; then
      echo "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

ensure_pnpm_on_path() {
  if command -v pnpm >/dev/null 2>&1 && pnpm -v >/dev/null 2>&1; then
    echo "[ci_post_clone] pnpm: $(command -v pnpm) ($(pnpm -v))"
    return 0
  fi

  if ! command -v npm >/dev/null 2>&1; then
    echo "[ci_post_clone] npm not found; cannot install pnpm"
    return 1
  fi

  # Do not use Corepack to install pnpm: Node 20.18.x ships Corepack that can
  # fail "Cannot find matching keyid" against current pnpm release metadata,
  # leaving a broken pnpm shim and breaking `npm install -g pnpm` (EEXIST).
  corepack disable >/dev/null 2>&1 || true

  local node_bin
  node_bin="$(dirname "$(command -v node)")"
  rm -f "$node_bin/pnpm" "$node_bin/pnpx" 2>/dev/null || true

  npm install -g --no-fund --no-audit "pnpm@${PNPM_VERSION}"

  if command -v pnpm >/dev/null 2>&1; then
    echo "[ci_post_clone] pnpm: $(command -v pnpm) ($(pnpm -v))"
    return 0
  fi

  return 1
}

pnpm_run() {
  if command -v pnpm >/dev/null 2>&1; then
    pnpm "$@"
  else
    npx --yes "pnpm@${PNPM_VERSION}" "$@"
  fi
}

ensure_pnpm_install() {
  ensure_pnpm_on_path || true

  local install_root="$APP_ROOT"
  if monorepo="$(monorepo_root_from "$APP_ROOT")"; then
    install_root="$monorepo"
    echo "[ci_post_clone] monorepo root: $install_root"
  else
    echo "[ci_post_clone] no pnpm-workspace.yaml above $APP_ROOT; installing in app directory only"
  fi

  cd "$install_root"
  pnpm_run install --frozen-lockfile || pnpm_run install
}

ensure_node
ensure_pnpm_install

cd "$IOS_DIR"
pod install --repo-update

echo "[ci_post_clone] done"

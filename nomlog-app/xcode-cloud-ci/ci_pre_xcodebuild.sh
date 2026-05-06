#!/bin/bash
# Xcode Cloud: optional — align CFBundleVersion with CI_BUILD_NUMBER for all targets.
# If your workflow already sets Current Project Version to $(CI_BUILD_NUMBER), you can empty this file.
set -euo pipefail

export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

if [[ -z "${CI_BUILD_NUMBER:-}" ]]; then
  echo "[ci_pre_xcodebuild] CI_BUILD_NUMBER unset; skipping agvtool"
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IOS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$IOS_DIR"
echo "[ci_pre_xcodebuild] agvtool new-version -all $CI_BUILD_NUMBER"
agvtool new-version -all "$CI_BUILD_NUMBER"

echo "[ci_pre_xcodebuild] done"

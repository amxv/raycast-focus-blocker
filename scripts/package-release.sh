#!/bin/bash
# Package the CI-built Rust binary and precompiled Raycast/browser extensions.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCH="${1:?Usage: package-release.sh arm64|x86_64 [output-directory]}"
OUT="${2:-$ROOT/.release}"

case "$ARCH" in
  arm64|x86_64) ;;
  *) echo "Unsupported macOS architecture: $ARCH" >&2; exit 1 ;;
esac

cd "$ROOT"
node scripts/check-versions.cjs

# The job builds natively on a matching GitHub macOS runner.
if [[ "$(uname -s)" != Darwin || "$(uname -m)" != "$ARCH" ]]; then
  echo "Release packaging requires a native macOS $ARCH runner." >&2
  exit 1
fi

TARGET_DIR="$(cargo metadata --manifest-path bridge/Cargo.toml --format-version 1 --no-deps | node -e 'let s="";process.stdin.on("data",x=>s+=x).on("end",()=>console.log(JSON.parse(s).target_directory))')"
BRIDGE_BIN="$TARGET_DIR/release/focus-blocker-bridge"

for input in "$BRIDGE_BIN" dist/package.json dist/plugin.json dist/manage.js dist/toggle.js browser-extension/manifest.json defaults/state.json LICENSE; do
  if [[ ! -f "$input" ]]; then
    echo "Missing release input: $input" >&2
    exit 1
  fi
done

mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT
mkdir -p "$TEMP/bin" "$TEMP/raycast-extension" "$TEMP/browser-extension" "$TEMP/defaults"

install -m 755 "$BRIDGE_BIN" "$TEMP/bin/focus-blocker-bridge"
cp -R dist/. "$TEMP/raycast-extension/"
cp -R browser-extension/. "$TEMP/browser-extension/"
cp defaults/state.json "$TEMP/defaults/state.json"
cp LICENSE "$TEMP/LICENSE"

ASSET="focus-blocker-macos-$ARCH.tar.gz"
tar -czf "$OUT/$ASSET" -C "$TEMP" .
echo "Packaged $OUT/$ASSET"

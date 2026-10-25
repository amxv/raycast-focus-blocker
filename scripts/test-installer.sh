#!/bin/bash
# Safe, offline installer test. Only writes beneath a throwaway HOME.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMP="$(mktemp -d "${TMPDIR:-/tmp}/focus-blocker-smoke.XXXXXXXX")"
trap 'rm -rf "$TEMP"' EXIT

STAGE="$TEMP/stage"
RELEASES="$TEMP/releases"
FAKE_HOME="$TEMP/user-home"
mkdir -p "$STAGE/bin" "$STAGE/raycast-extension" "$STAGE/browser-extension" "$STAGE/defaults" "$RELEASES" "$FAKE_HOME"

cp "$ROOT/defaults/state.json" "$STAGE/defaults/state.json"
cp "$ROOT/browser-extension/manifest.json" "$STAGE/browser-extension/manifest.json"
printf '{"name":"focus-blocker"}\n' > "$STAGE/raycast-extension/package.json"
touch "$STAGE/raycast-extension/manage.js" "$STAGE/raycast-extension/toggle.js"

for arch in arm64 x86_64; do
  printf '#!/bin/sh\necho "fake bridge %s"\n' "$arch" > "$STAGE/bin/focus-blocker-bridge"
  chmod 755 "$STAGE/bin/focus-blocker-bridge"
  tar -czf "$RELEASES/focus-blocker-macos-$arch.tar.gz" -C "$STAGE" .
done
(cd "$RELEASES" && shasum -a 256 focus-blocker-macos-*.tar.gz > SHA256SUMS.txt)

for arch in arm64 x86_64; do
  HOME="$FAKE_HOME" \
  FOCUS_BLOCKER_TEST_ARCH="$arch" \
  FOCUS_BLOCKER_SKIP_LAUNCHD=1 \
  FOCUS_BLOCKER_RELEASE_BASE_URL="file://$RELEASES" \
  bash "$ROOT/install.sh" > "$TEMP/install-$arch.log" 2>&1

  test "$("$FAKE_HOME/.local/bin/focus-blocker-bridge")" = "fake bridge $arch"
  test -f "$FAKE_HOME/.local/share/focus-blocker/raycast-extension/manage.js"
  test -f "$FAKE_HOME/.local/share/focus-blocker/browser-extension/manifest.json"
  test -f "$FAKE_HOME/.config/focus-blocker/state.json"
  plutil -lint "$FAKE_HOME/Library/LaunchAgents/xyz.ashray.focus-blocker-bridge.plist" >/dev/null
  echo "PASS: $arch release selected, verified, and installed"
done

# An upgrade must never reset the user's blocklist.
sed -i '' 's/"revision": 1/"revision": 222/' "$FAKE_HOME/.config/focus-blocker/state.json"
HOME="$FAKE_HOME" FOCUS_BLOCKER_SKIP_LAUNCHD=1 \
FOCUS_BLOCKER_RELEASE_BASE_URL="file://$RELEASES" bash "$ROOT/install.sh" > "$TEMP/reinstall.log" 2>&1
grep -q '"revision": 222' "$FAKE_HOME/.config/focus-blocker/state.json"
echo 'PASS: upgrade preserves the existing blocklist'

# Corrupted assets are rejected before installation.
printf 'tampered\n' >> "$RELEASES/focus-blocker-macos-arm64.tar.gz"
if HOME="$FAKE_HOME" FOCUS_BLOCKER_SKIP_LAUNCHD=1 FOCUS_BLOCKER_TEST_ARCH=arm64 \
  FOCUS_BLOCKER_RELEASE_BASE_URL="file://$RELEASES" bash "$ROOT/install.sh" > "$TEMP/tampered.log" 2>&1; then
  echo 'FAIL: tampered release was accepted' >&2
  exit 1
fi
grep -q 'SHA-256 mismatch' "$TEMP/tampered.log"
echo 'PASS: invalid SHA-256 is rejected'

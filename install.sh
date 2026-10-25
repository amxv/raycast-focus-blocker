#!/bin/bash
# Public installer: prebuilt releases, no development toolchain or sudo needed.
set -euo pipefail

REPOSITORY="amxv/raycast-focus-blocker"
SERVICE_LABEL="xyz.ashray.focus-blocker-bridge"

fail() { printf 'Focus Blocker: %s\n' "$*" >&2; exit 1; }
info() { printf '  %s\n' "$*"; }

case "${1:-}" in
  -h|--help)
    cat <<'HELP'
Focus Blocker installer (macOS)

Usage: bash install.sh

Downloads the latest release for your Mac, checks the SHA-256 checksum,
installs the Rust bridge and both extensions, and prints the steps to import
the Raycast and browser extensions. It never uses sudo.
HELP
    exit 0
    ;;
  '') ;;
  *) fail "Unknown argument: $1 (try --help)" ;;
esac

[[ "$(uname -s)" == Darwin ]] || fail "Raycast requires macOS; this installer does not support $(uname -s)."
ARCH="${FOCUS_BLOCKER_TEST_ARCH:-$(uname -m)}"
case "$ARCH" in
  arm64|x86_64) ;;
  *) fail "Unsupported Mac architecture: $ARCH (expected arm64 or x86_64)." ;;
esac

for program in curl tar shasum awk mktemp install; do
  command -v "$program" >/dev/null 2>&1 || fail "Required macOS utility is missing: $program"
done

ARCHIVE="focus-blocker-macos-$ARCH.tar.gz"
BASE_URL="${FOCUS_BLOCKER_RELEASE_BASE_URL:-https://github.com/$REPOSITORY/releases/latest/download}"
INSTALL_ROOT="${FOCUS_BLOCKER_INSTALL_ROOT:-$HOME/.local/share/focus-blocker}"
[[ "$INSTALL_ROOT" != / && "$INSTALL_ROOT" != . ]] || fail "Invalid installation directory."
BIN_DIR="${FOCUS_BLOCKER_BIN_DIR:-$HOME/.local/bin}"
LAUNCH_DIR="${FOCUS_BLOCKER_LAUNCH_AGENTS_DIR:-$HOME/Library/LaunchAgents}"
STATE_DIR="${FOCUS_BLOCKER_STATE_DIR:-$HOME/.config/focus-blocker}"
PLIST="$LAUNCH_DIR/$SERVICE_LABEL.plist"

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/focus-blocker-install.XXXXXXXX")"
trap 'rm -rf "$TEMP_DIR"' EXIT
mkdir -p "$TEMP_DIR/extract"

download() {
  local asset="$1"
  curl --fail --silent --show-error --location --retry 3 --connect-timeout 15 --max-time 180 \
    "$BASE_URL/$asset" --output "$TEMP_DIR/$asset" || fail "Could not download $asset. Check $REPOSITORY/releases and try again."
}

printf '\nInstalling Focus Blocker for macOS %s\n' "$ARCH"
info "Fetching the latest GitHub release..."
download SHA256SUMS.txt
download "$ARCHIVE"

# A release checksum is checked before extracting or executing any binary.
EXPECTED="$(awk -v filename="$ARCHIVE" '$2 == filename {print $1}' "$TEMP_DIR/SHA256SUMS.txt")"
[[ "$EXPECTED" =~ ^[[:xdigit:]]{64}$ ]] || fail "Missing or invalid SHA-256 digest for $ARCHIVE."
ACTUAL="$(shasum -a 256 "$TEMP_DIR/$ARCHIVE" | awk '{print $1}')"
EXPECTED="$(printf '%s' "$EXPECTED" | tr 'A-F' 'a-f')"
[[ "$ACTUAL" == "$EXPECTED" ]] || fail "Release SHA-256 mismatch; refusing to install."

tar -xzf "$TEMP_DIR/$ARCHIVE" -C "$TEMP_DIR/extract"
ROOT="$TEMP_DIR/extract"
for file in bin/focus-blocker-bridge browser-extension/manifest.json raycast-extension/package.json raycast-extension/manage.js raycast-extension/toggle.js defaults/state.json; do
  [[ -f "$ROOT/$file" ]] || fail "The release is missing: $file"
done

info "Installing the macOS service and extension bundles..."
mkdir -p "$BIN_DIR" "$INSTALL_ROOT" "$LAUNCH_DIR"
mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"

# Never overwrite existing user preferences on upgrades.
if [[ ! -e "$STATE_DIR/state.json" ]]; then
  (umask 077; cp -n "$ROOT/defaults/state.json" "$STATE_DIR/state.json")
fi

# Only these two installer-owned subdirectories are replaced during upgrades.
for component in raycast-extension browser-extension; do
  rm -rf -- "${INSTALL_ROOT:?}/$component"
  cp -R "$ROOT/$component" "$INSTALL_ROOT/$component"
done

# Stop the existing per-user process only immediately before replacing it.
if [[ "${FOCUS_BLOCKER_SKIP_LAUNCHD:-0}" != 1 && -f "$PLIST" ]]; then
  launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
fi
install -m 755 "$ROOT/bin/focus-blocker-bridge" "$BIN_DIR/focus-blocker-bridge.new"
mv -f "$BIN_DIR/focus-blocker-bridge.new" "$BIN_DIR/focus-blocker-bridge"

# Escape XML-sensitive path characters before writing the LaunchAgent.
xml_escape() {
  printf '%s' "$1" | sed -e 's/\&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g'
}
BIN_XML="$(xml_escape "$BIN_DIR/focus-blocker-bridge")"
HOME_XML="$(xml_escape "$HOME")"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$SERVICE_LABEL</string>
  <key>ProgramArguments</key><array><string>$BIN_XML</string></array>
  <key>EnvironmentVariables</key><dict><key>HOME</key><string>$HOME_XML</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
</dict></plist>
EOF

if [[ "${FOCUS_BLOCKER_SKIP_LAUNCHD:-0}" != 1 ]]; then
  plutil -lint "$PLIST" >/dev/null || fail "Could not validate the LaunchAgent configuration."
  launchctl bootstrap "gui/$(id -u)" "$PLIST" || fail "Unable to start the Rust service via launchd."
  launchctl enable "gui/$(id -u)/$SERVICE_LABEL" || fail "Could not enable the Rust service."
fi

printf '\nFocus Blocker installed. Finish these two steps:\n\n'
printf '  1. Raycast: open Settings > Extensions > + > Import Extension.\n'
printf '     Select this folder: %s/raycast-extension\n\n' "$INSTALL_ROOT"
printf '  2. Dia or Chrome: open chrome://extensions, enable Developer Mode,\n'
printf '     click Load unpacked, and select: %s/browser-extension\n\n' "$INSTALL_ROOT"
info 'Tip: Press Cmd+Shift+G in either folder picker to paste the hidden ~/.local path.'
info 'In Raycast, search for "Manage Blocked Websites" or "Toggle Website Blocking".'
info 'Your blocklist starts empty. Add websites or URL paths from Raycast.'
info 'For future updates, run this installer again and reload the browser extension.'
printf '\n'

#!/bin/bash
set -euo pipefail

# Installs only within the current macOS user. No sudo, network proxy,
# certificate authority, password prompt, or changes to /etc/hosts.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LABEL="xyz.ashray.focus-blocker-bridge"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
BIN="$HOME/.local/bin/focus-blocker-bridge"

cd "$ROOT"
npm run seed
cargo build --manifest-path "$ROOT/bridge/Cargo.toml" --release --locked
TARGET_DIR="$(cargo metadata --manifest-path "$ROOT/bridge/Cargo.toml" --format-version 1 --no-deps | node -e 'let s="";process.stdin.on("data",x=>s+=x).on("end",()=>console.log(JSON.parse(s).target_directory))')"

mkdir -p "$HOME/.local/bin" "$HOME/Library/LaunchAgents"
launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
install -m 755 "$TARGET_DIR/release/focus-blocker-bridge" "$BIN"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>$LABEL</string>
    <key>ProgramArguments</key><array><string>$BIN</string></array>
    <key>EnvironmentVariables</key><dict><key>HOME</key><string>$HOME</string></dict>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>ProcessType</key><string>Background</string>
</dict>
</plist>
EOF

plutil -lint "$PLIST"
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/$LABEL"
echo "Installed low-memory Rust service at $BIN"
echo "Blocklist at $HOME/.config/focus-blocker/state.json"
echo "Next: install the companion from $ROOT/browser-extension in Dia's Extensions page."

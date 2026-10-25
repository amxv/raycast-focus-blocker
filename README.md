# Focus Blocker

[![CI](https://github.com/amxv/raycast-focus-blocker/actions/workflows/ci.yml/badge.svg)](https://github.com/amxv/raycast-focus-blocker/actions/workflows/ci.yml) [![Latest release](https://img.shields.io/github/v/release/amxv/raycast-focus-blocker)](https://github.com/amxv/raycast-focus-blocker/releases/latest)

**Block the rabbit holes, not the rest of the internet.** Focus Blocker is a small, local-first website blocker you control from [Raycast](https://www.raycast.com/). Block a whole site or just one URL path, and turn your rules on or off in a keystroke.

**Your blocklist starts empty.** Add only the websites you want to block. For example, you can block YouTube Shorts while keeping normal YouTube videos, search, subscriptions, and playlists available.

### Install (macOS)

```bash
curl -fsSL https://raw.githubusercontent.com/amxv/raycast-focus-blocker/main/install.sh | bash
```

The installer picks **Apple Silicon (arm64)** or **Intel (x86_64)** automatically, downloads the latest [GitHub release](https://github.com/amxv/raycast-focus-blocker/releases), verifies its SHA-256 checksum, and installs the native Rust helper and both extensions. **No Node.js, Rust, or sudo required.**

Finish by importing the two included extensions:

1. **Raycast:** Open *Raycast Settings → Extensions → + → Import Extension* and select `~/.local/share/focus-blocker/raycast-extension`.
2. **Dia or Chrome:** Open `chrome://extensions`, enable *Developer mode*, select *Load unpacked*, and choose `~/.local/share/focus-blocker/browser-extension`.

**Tip:** Press `⌘⇧G` in either folder picker to paste the hidden `~/.local` path.

Install the browser companion separately in each Chromium browser where you want URL blocking. Raycast must be installed and signed in to import a local extension. **Safari and Windows/Linux are not supported.**

### Everyday use

Open Raycast and search for:

| Command | What it does |
| --- | --- |
| **Manage Blocked Websites** | Add, edit, remove, or individually pause websites and URL patterns. |
| **Toggle Website Blocking** | Turn all blocking on/off instantly. Assign a hotkey in Raycast Settings. |

Optional example rules (none are enabled or installed by default):

| Rule | Blocks | Still allows |
| --- | --- | --- |
| `https://www.youtube.com/shorts/*` | YouTube Shorts URLs | Regular YouTube videos (`/watch`), search, playlists |
| `reddit.com` | Reddit and its subdomains | Other websites |
| `https://example.com/feeds/*` | One distracting path | The rest of `example.com` |

New rules take effect when the browser companion synchronizes with the Rust helper. To update later, rerun the installer, **reload the browser companion** under `chrome://extensions`, and **reimport the Raycast bundle** if needed. Existing rules are preserved, including any custom websites you have already blocked.

### How it works

```text
Raycast (TypeScript/React)
    │ Updates ~/.config/focus-blocker/state.json
    ▼
Rust loopback bridge (127.0.0.1:47846)
    │ Notifies the browser when settings change
    ▼
Chromium extension (Manifest V3)
    ├─ DeclarativeNetRequest for full URL navigations
    └─ WebNavigation for in-page navigation (like YouTube Shorts)
```

The Rust helper runs as a **per-user LaunchAgent**. It reads local settings; it is not a web proxy and never handles page content or video data. The browser companion checks navigation URLs only, so video downloads, playback, and decoding are unaffected. Existing browser rules stay active during brief helper restarts.

The Chromium extension requires site access to enforce arbitrary URL patterns that you add in Raycast. It does **not** send browsing history to a server or inject scripts into video pages. Settings stay on your machine. You can inspect the [source](browser-extension/) and [Rust bridge](bridge/src/main.rs).

### From source

Requires macOS, Raycast, Node.js 22.14+, npm, and Rust:

```bash
git clone https://github.com/amxv/raycast-focus-blocker.git
cd raycast-focus-blocker
npm ci
bash scripts/install-local.sh
npm run dev
```

The developer command registers the Raycast extension locally. You can stop it after the initial import. Install the browser companion from `browser-extension/` using the same *Load unpacked* steps above.

To validate changes:

```bash
npm run check:versions
npm run lint && npm run typecheck && npm test && npm run build
cargo fmt --manifest-path bridge/Cargo.toml -- --check
cargo clippy --manifest-path bridge/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path bridge/Cargo.toml --locked
bash scripts/test-installer.sh  # macOS; offline installer smoke test
```

### Releases

GitHub Actions runs CI on pushes and pull requests. Pushing a `vX.Y.Z` tag that matches the version in `package.json`, `package-lock.json`, `bridge/Cargo.toml`, and `browser-extension/manifest.json` builds **native macOS arm64 and x86_64** packages, generates SHA-256 checksums, and publishes a GitHub release.

To prepare the next version, update those four version fields, run the checks above, commit, then push the matching tag. No signing credentials are needed; packages contain a command-line helper, not a macOS `.app` bundle.

### Uninstall

1. Remove the Focus Blocker companion in each browser's `chrome://extensions` page.
2. Remove the locally imported Focus Blocker commands in Raycast Settings → Extensions.
3. Remove the background helper and installed bundles:

```bash
launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/xyz.ashray.focus-blocker-bridge.plist"
rm -f "$HOME/Library/LaunchAgents/xyz.ashray.focus-blocker-bridge.plist" "$HOME/.local/bin/focus-blocker-bridge"
rm -rf "$HOME/.local/share/focus-blocker"
```

Your blocklist stays in `~/.config/focus-blocker/state.json` unless you choose to delete it.

### License

[Apache License 2.0](LICENSE). This project is distributed independently through GitHub Releases rather than the Raycast Store (whose manifest lint currently requires MIT license metadata).

# Focus Blocker

Control distracting websites from Raycast without blocking useful pages. Ships with **YouTube Shorts** blocked, but **ordinary YouTube stays available**.

## Commands

- **Manage Blocked Websites**: add/edit/remove rules, toggle individual websites, enable/disable all blocking.
- **Toggle Website Blocking**: switch all blocking on or off immediately from Raycast. You can assign a Raycast hotkey to this command.

You can block a full website with `reddit.com` (includes subdomains), or only a path with `https://www.youtube.com/shorts/*`. Normal videos at `https://www.youtube.com/watch?v=...` remain available.

## One-time setup on macOS

1. In this folder, run `npm install`, then `bash scripts/install-local.sh`. This compiles a **small Rust background service** and registers it as a per-user launch agent (no root privileges).
2. Run `npm run dev` once. Raycast registers the two commands. You can stop the development command with Ctrl+C; the commands stay installed.
3. Open **Dia > Extensions > Manage Extensions** (or `chrome://extensions` in Dia). Enable **Developer Mode**, click **Load unpacked**, then choose `browser-extension` in this project.
4. The browser companion icon should say **Blocking is ON, 1 active rule**. Test a Shorts URL and a normal YouTube watch URL.

The same companion also supports Google Chrome by loading the same folder as an unpacked extension. Each browser must have the companion installed separately. This is not a Safari blocker or a system-wide network filter.

The browser asks for access to website URLs. This is necessary to redirect blocked URLs to the local focus screen, even for websites you add later. The companion does not read page content or save browsing history.

You can set a hotkey for **Toggle Website Blocking** in Raycast Preferences > Extensions > Focus Blocker. All settings are local in `~/.config/focus-blocker/state.json` and persist across restarts.

## Architecture

- **Raycast**: TypeScript + React (@raycast/api) for the UI and instant toggle.
- **Rust bridge**: a tiny `127.0.0.1:47846` server, started at login by launchd. Read-only JSON `/state`, `/watch` for change notifications, and `/changed` to wake watchers. Does not inspect web requests.
- **Browser companion**: Manifest V3 Chrome/Dia extension. DeclarativeNetRequest blocks regular navigations; event-driven WebNavigation catches in-page changes (including YouTube's Shorts routing). No browser history is uploaded, proxied, or logged. Rules remain active while the Rust process is briefly unavailable.

The default rule is `https://www.youtube.com/shorts/*`. Only URLs on `www.youtube.com` whose path starts with `/shorts/` are blocked. Other paths, including `/watch`, `/results`, and `/feed/subscriptions`, are not matched.

## License and Raycast compatibility

This repository is licensed under **Apache License 2.0**, including the Raycast TypeScript code and the Rust bridge. Local builds and developer-mode installation work with this license. Raycast's Store manifest validator currently requires the literal `"MIT"` package license, so `ray lint` reports a schema error if used for Store submission; `npm run lint` checks the actual TypeScript/Prettier code instead. The project is intentionally not submitted to Raycast's Store. If the Store validator eventually accepts Apache 2.0, `ray lint` can be restored to the default lint script.

### Validation

```bash
npm run typecheck
npm run lint
npm test
npm run build
cargo test --manifest-path bridge/Cargo.toml
```

### Uninstall

Remove the companion under Dia/Chrome's Extensions page, then remove the Raycast commands in Raycast Settings. To stop and remove the small Rust login service:

```bash
launchctl bootout "gui/$(id -u)" "$HOME/Library/LaunchAgents/xyz.ashray.focus-blocker-bridge.plist"
rm "$HOME/Library/LaunchAgents/xyz.ashray.focus-blocker-bridge.plist" "$HOME/.local/bin/focus-blocker-bridge"
```

Your blocklist remains in `~/.config/focus-blocker/` unless you choose to delete it.

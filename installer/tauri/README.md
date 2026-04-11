# ClaudeGUI Tauri Installer

This directory packages ClaudeGUI as a native macOS (.dmg) / Windows (.msi)
application using [Tauri v2](https://tauri.app). The Rust shell hosts a native
webview and spawns the bundled Node.js runtime as a sidecar, which runs the
Next.js custom server (`server.js`) against `127.0.0.1:<random-port>`. The
webview then navigates to that local URL.

## Layout

```
installer/tauri/
├── src-tauri/              # Rust crate driving Tauri
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── entitlements.plist
│   ├── src/main.rs         # sidecar spawner + webview boot
│   ├── binaries/           # bundled Node.js executables (fetched at build)
│   └── resources/          # staged at build time by prepare-bundle.sh
├── scripts/
│   ├── fetch-node.sh       # downloads Node.js for a given target triple
│   └── prepare-bundle.sh   # runs `npm run build` and stages resources
└── dist/                   # frontend placeholder (Next.js is served at runtime)
```

## Local build (macOS)

```bash
# 1. Fetch a Node runtime for your host
bash installer/tauri/scripts/fetch-node.sh

# 2. Build
cd installer/tauri/src-tauri
cargo tauri build
```

The resulting `.dmg` will appear under `src-tauri/target/release/bundle/dmg/`.

## Claude CLI bundling

On first launch the embedded server calls `scripts/installer-runtime/ensure-claude-cli.mjs`
which installs `@anthropic-ai/claude-code` into an app-local `node-prefix`
(no sudo required). That prefix's `bin/` is prepended to `PATH` when the web
terminal spawns PTYs, so `claude login` and other CLI commands work
transparently inside the app.

## Code signing

- **macOS**: set `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`,
  `APPLE_TEAM_ID` secrets in CI for notarization.
- **Windows**: set `TAURI_SIGNING_PRIVATE_KEY` (Authenticode) secrets.

See `.github/workflows/release.yml`.

## Icons

Place icon files at `src-tauri/icons/` in the sizes referenced by
`tauri.conf.json` (`32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`,
`icon.ico`). The default `cargo tauri init` command generates these from a
source PNG.

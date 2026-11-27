# AppStudio Development Workflow & Release Guide

This guide covers the day-to-day workflow for building, debugging, testing, and releasing applications with **Spid3r Studio (v1.5.0)** and **Spid3r v1.5.0**.

---

## 1. Project Anatomy

A standard AppStudio application contains:

```text
workspace/MyApp/
├── studio.json          # App metadata, theme, deep links, CSP & target SDK config
├── app.matrix           # Platform-agnostic UI pages, handlers, boot & studio_app()
├── main.matrix          # Thin desktop entry wiring gui_* + window shims to App
├── pages/               # Multi-screen page modules (optional)
├── assets/              # App icons, SVGs, static files
├── vendor/studio/       # Vendored framework modules (created by `studio new`)
└── storage/             # Local runtime kv.json persistence (git-ignored)
```

- **Linked vs. Vendored mode:** Apps created with `studio new` copy `frameworks/studio/` into `vendor/studio/`. Run `spid3r run studio.matrix upgrade <appdir>` anytime to sync your project's `vendor/studio/` and `targets/host.html` with the latest framework.

---

## 2. Daily Development Loop

### Desktop Preview & Hot Reload
```powershell
# Standard desktop WebView launch (tree interpreter by default)
spid3r run studio.matrix run workspace/demo

# Test under the bytecode VM + open WebView DevTools
spid3r run studio.matrix run workspace/demo --engine vm --devtools

# Hot-reload watcher (preserves Router, State, Theme & I18n across saves)
spid3r run studio.matrix dev workspace/demo
```

### Web / PWA Live-Reload Server
```powershell
spid3r run studio.matrix dev workspace/demo --target web --host 0.0.0.0 --port 8080
```
`DevWeb.matrix` watches `.matrix`/`.mt`/`studio.json` files, rebuilds the FlatKit WASM bundle on change, and triggers browser reload via `/__studio_reload`.

### Static Verification & Formatting
```powershell
spid3r run studio.matrix check workspace/demo
spid3r fmt workspace/demo/app.matrix
```
> **Always use `spid3r fmt`** before committing. Write all `.matrix` / `.mt` files as **UTF-8 without BOM**.

---

## 3. Debugging Tools

1. **In-App Dev Overlay:** Call `.dev_mode(true)` on `appkit.App(...)` during development so caught page/handler errors display the bounded log ring tail and stack context.
2. **FlatKit Source Line Mapping:** Non-release web builds emit `build/web/app.matrix.map.json`. Call `FlatKit.map_line(line)` (or inspect the map JSON) to translate flattened bundle line numbers back to the original source file and line.
3. **WebView DevTools:** Pass `--devtools` to `studio run` / `studio dev` (or call `Bridge.set_devtools(true)` in debug builds).
4. **Spid3r VM Debugger & LSP:**
   ```powershell
   spid3r debug workspace/demo/app.matrix --break 25
   spid3r lsp   # Editor integration over stdio
   ```
5. **1-Click Recovery:** If files accumulate BOMs, stale `.studio-*` lock flags, or outdated vendored modules, click **Auto-Recover** in the Control Panel (`core/Recovery.matrix`).

---

## 4. Testing Pyramid

Run the complete automated verification pipeline from the repository root:

```powershell
# 1. Canonical fmt --check + strict --deny-warnings + 5 .matrix test suites
Remove-Item Env:SPID3R_PATH -ErrorAction SilentlyContinue
spid3r run studio.matrix test

# Filter a single suite, or pass --all to check every WIP project in workspace/
spid3r run studio.matrix test flatkit
spid3r run studio.matrix test --all

# 2. ClientJS, DOM morph, wasmhost & spid3r.wasm runtime suite
node --test core/tests/client_js.test.mjs
```

### Headless Desktop Smoke Checks
```powershell
$env:SPID3R_PATH = '.;frameworks;core;core/cli'
spid3r gui core/gui/main.matrix --html core/gui/host.html --dry-run once
spid3r gui workspace/demo/main.matrix --html frameworks/targets/host.html --dry-run once
```

---

## 5. Production Release Builds

Pass `--release` to enable release hardening and emit a CycloneDX 1.5 `sbom.json`:

```powershell
spid3r run studio.matrix build workspace/demo --target web --release
spid3r run studio.matrix build workspace/demo --target desktop --release
spid3r run studio.matrix build workspace/demo --target android --release
spid3r run studio.matrix build workspace/demo --target ios --release
```

What `--release` adds:
- **Web / PWA:** Enables `upgrade-insecure-requests;` in CSP, omits `app.matrix.map.json` source maps, keeps per-build script nonces + Trusted Types + SHA-256 SRI, and emits `sbom.json`.
- **Desktop:** Compiles a hardened `run_payload_strict()` launcher with `--bytecode`, `--embed`, `--bundle-runtime`, OS packaging templates (`AppxManifest.xml` / `Info.plist` / `.desktop`), `update-feed.json`, optional `STUDIO_DESKTOP_SIGN_CMD` signing hook, and `sbom.json`.
- **Android:** Emits `proguard-rules.pro` (R8), release `signingConfigs` template, `network_security_config.xml`, and `sbom.json`.
- **iOS:** Emits `Entitlements.plist`, `Info.plist`, `LaunchScreen.storyboard`, `xtool.yml`, `Package.swift`, and `sbom.json`.

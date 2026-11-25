# AppStudio Architecture

**AppStudio (Spid3r Studio)** is a cross-platform application framework, multi-file bundler, CLI, and MVC Control Panel authored in **Spid3r v1.1.1** (`.matrix`), targeting **Web/PWA**, **Android**, **iOS**, **Windows**, **macOS**, and **Linux**.

---

## 1. Repository Layout (5-Tier A–Z Structure)

- **`frameworks/`** — Core declarative runtime (`frameworks/studio/*.matrix` + `client.js`), 6-platform target templates (`frameworks/targets/*`), project starter templates (`frameworks/templates/starter/*`), and `registry.json`.
- **`downloads/`** — Managed offline toolchains (`xtool 1.24.0`, `Xcode_27.2.xip`), cached `spid3r.wasm` / `spid3r.js` with `checksums.sha256`, and `packages/catalog.json` + `catalog.json.sha256`.
- **`documents/`** — Developer handbook (`documentation.html`), guides, tutorials, configuration reference, exported logs, and diagnostic JSON reports.
- **`workspace/`** — Showcase multi-file application (`workspace/demo/`) and user-created projects.
- **`core/`** — CLI router & builders (`core/cli/*.matrix`), scope-aware bundler (`core/tools/FlatKit.matrix`), diagnostics (`core/Diagnostics.matrix`), recovery (`core/Recovery.matrix`), MVC Control Panel GUI (`core/gui/*`), and automated tests (`core/tests/*`).

---

## 2. Runtime Execution Models

### Native Desktop (`spid3r gui` / `BuildDesktop`)
- Long-lived `tao` + WebView2/WKWebView/WebKitGTK process.
- `App.run()` mounts `ClientJS`, restores optional `.studio-hot-state.json` (on hot reload), dispatches UI/tick events via `Bridge.dispatch_safe()`, and morphs the DOM via `window.__studio.patch()`.
- Background work (`Http.request_async`) uses `spawn` workers and triggers `App.request_render()` + on-demand `__studio_tick__` polling.

### Web / Mobile WASM (`BuildWeb` / `BuildAndroid` / `BuildIos`)
- Bundled by `FlatKit.matrix` (single-pass scope-aware emitter enforcing module isolation, interfaces/`implements`, private visibility, and `line_map`).
- `wasmworker.js` and `wasmhost.template.html` load definitions once into a **persistent `spid3r.wasm` session** (`sp.evalSession(..., 'vm')`) and dispatch events via `__studio_dispatch(evJson)` (with stateless `sp.eval()` fallback).
- Each turn exchanges an envelope (`event`, `router`, `state`, `storage`, `theme`, `i18n`, `slot_nonce`, `frame_epoch`, `caps`) and returns an atomic `@@STUDIO_FRAME@@` payload (`css`, `html`, `html_hash`, `storage_version`, `effects`).

---

## 3. Security & Platform Capability Architecture

- **XSS & CSS Defense:** Context-specific escaping (`esc`, `esc_attr`, `safe_url`, `esc_icon`, `esc_css_val`, `esc_style`, `sanitize_html`) + opt-in raw `ui.html()`.
- **Web CSP, SRI & Trusted Types:** Per-build script `nonce-{{APP_CSP_NONCE}}`, `require-trusted-types-for 'script'`, `trusted-types appstudio`, SHA-256 SRI on `spid3r.js`, and per-app `connect-src`.
- **Authenticated Bridge:** Per-session random `slot_nonce`, monotonic `frame_epoch`, atomic `postUiWithFlush`, and SSRF-guarded `Http.request()`.
- **Encrypted & Durable Storage:** WebCrypto AES-GCM (`indexedDB` non-extractable key) + `indexedDB` storage mirror on web; Keychain + Application Support durable files on iOS; AndroidKeyStore AES-GCM + `EncryptedSharedPreferences`-equivalent private prefs on Android.
- **Native Capabilities & SSO:** Unified `Bridge` effect contract (`clipboard`, `open_url`, `haptic`, `secure_store`, `files`, `share`, `auth`/`deep_link`, `geolocation`, `biometrics`, `camera`, `notifications`, `contacts`, `bluetooth`, `background_task`) wired to `StudioAndroid` (`MainActivity.kt`) and `StudioNativeBridge` (`App.swift`).

---

## 4. Build Verification & Release Gates

Every Web/Android/iOS build runs:
1. Build-time secret scanner (`BuildWeb.scan_secrets`) blocking hardcoded API keys and PEM private keys.
2. Unsupported `enum` lint check (`A-51`).
3. Full `spid3r check --deny-warnings` compilation of the exact flattened bundle (`A-38`).
4. `--release` emits `sbom.json` and platform packaging/signing configurations (Android R8 + `signingConfigs`, iOS `Entitlements.plist` + `Info.plist` + `LaunchScreen.storyboard`, Desktop MSIX/DMG/AppImage packaging + `update-feed.json`).

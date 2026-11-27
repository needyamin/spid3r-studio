# AppStudio Architecture

**AppStudio (Spid3r Studio v1.5.0)** is a cross-platform application framework, multi-file bundler, CLI, and MVC Desktop Control Panel authored in **Spid3r v1.5.0** (`.matrix` / `.mt`), targeting **Web/PWA**, **Android**, **iOS**, **Windows**, **macOS**, and **Linux**.

---

## 1. Repository Layout (5-Tier A–Z Structure)

| Tier | Path | Responsibility |
| :--- | :--- | :--- |
| **1. Frameworks** | `frameworks/` | Core reactive runtime (`frameworks/studio/*.matrix` + `client.js`), 6-platform target templates (`frameworks/targets/*`), starter scaffolding templates (`frameworks/templates/starter/*`), and `registry.json`. |
| **2. Downloads** | `downloads/` | Managed offline toolchains (`xtool 1.24.0`, `Xcode_27.2.xip`), versioned `spid3r.wasm` / `spid3r.js` runtime cache with `checksums.sha256`, and `packages/catalog.json` + `catalog.json.sha256`. |
| **3. Documents** | `documents/` | Visual Developer Handbook (`documentation.html`), SVG architecture diagrams, onboarding & workflow guides (`guides/`), language tutorial (`tutorials/`), configuration reference (`references/`), logs, and QA reports. |
| **4. Workspace** | `workspace/` | Showcase multi-file application (`workspace/demo/`) and user-created applications. |
| **5. Core & Tools** | `core/` | Single-source version constants (`core/Version.matrix`), CLI subcommands (`core/cli/*.matrix`), scope-aware bundler (`core/tools/FlatKit.matrix`), diagnostics (`core/Diagnostics.matrix`), recovery (`core/Recovery.matrix`), extension registry (`core/Plugins.matrix`), MVC Control Panel (`core/gui/*`), and automated tests (`core/tests/*`). |

---

## 2. Layered Framework Architecture (`frameworks/studio/`)

AppStudio separates declarative app authoring from platform transport:

1. **Foundation & Utilities:** `Util.matrix` (defensive deep-copy, context-aware HTML/CSS/URL escaping, FNV-1a), `Errors.matrix` (`AppError`, structured Result helpers).
2. **Application State & Persistence:**
   - `State.matrix`: Deep-copied reactive in-memory key-value store.
   - `Storage.matrix`: Crash-safe JSON persistence using `.bak` backups, corruption locks, schema migrations, dirty-flag `batch`/`flush`, and `write_file_atomic()`.
   - `Store.matrix`: Interface-backed `Store` contract implemented by `MemoryStore` and `FileStore`, plus a DI `Container`.
3. **Presentation & Localization:** `Theme.matrix` (light/dark schemes & custom token overrides), `CSS.matrix` (sanitized `:root` vars & RTL logical CSS), `I18n.matrix` (locale catalog & RTL direction), `Components.matrix` (declarative UI node constructors + `ui.component` memoization), `Render.matrix` (O(1) table-dispatched HTML renderer with roving `tabindex` & ARIA).
4. **Navigation, Networking & Host Bridge:**
   - `Router.matrix`: Multi-tab navigation stacks (`push`, `pop`, `replace`, `switch_tab`, `snapshot`, `restore`).
   - `Bridge.matrix`: Entry shim binding (`install` + `install_window_api`), CSPRNG `slot_nonce` (`random_bytes` on native / `sha256` on WASM), authenticated slot dispatch, host capabilities (`host_caps` / `has_cap`), 15 host effects, and desktop window controls.
   - `Http.matrix`: SSRF-guarded sync/async HTTP (`spawn` workers on native, host effects on WASM/mobile) with host allow-listing.
   - `ClientJS.matrix` + `client.js`: Browser/WebView runtime (keyed DOM morphing, atomic `postUiWithFlush`, modal focus trap, roving tablist, WebCrypto AES-GCM, native bridge dispatch).
   - `App.matrix`: Application builder (`page`, `handler`, `tab_pages`, `boot`, `on_ready`, `on_error`, `on_deep_link`, `window_size`, `window_min_size`, `window_bg`, `window_icon`, `on_resize`, `on_focus`, `on_theme_changed`, `on_file_drop`, `on_before_close`), queued re-entrant `render()`, and `wasm_run()`.

---

## 3. Runtime Execution Models

### Native Desktop (`spid3r gui` / `BuildDesktop`)
- Long-lived `tao` + WebView2/WKWebView/WebKitGTK process served over `https://spid3r.app` (`isSecureContext === true`).
- Entry `main.matrix` binds the 5 core `gui_*` shims via `.bridge(...)` and optional Spid3r v1.5.0 window controls via `.window_bridge(...)`.
- `App.run()` applies Phase-1 window geometry/theme/background color (preventing startup flash), mounts `ClientJS`, restores optional `.studio-hot-state.json` on hot reload, subscribes `ui`, `ready`, and optional window lifecycle events, and morphs the DOM via `window.__studio.patch()`.
- Release desktop builds (`--release`) compile a minimal `run_payload_strict()` launcher with `--bytecode`, `--embed`, `--bundle-runtime`, platform packaging templates (MSIX/DMG/desktop), and `update-feed.json`.

### Web / Mobile WASM (`BuildWeb` / `BuildAndroid` / `BuildIos`)
- Bundled by `core/tools/FlatKit.matrix` (single-pass scope-aware emitter):
  - Isolates module top-level symbols (`pub_`, `cls_`, `iface_`, `enum_`, `mod_`) while preserving class methods, fields, and enum variant constructors.
  - Supports Spid3r v1.5.0 `import "mod" as alias;`, `import { a, b as c } from "mod";`, embedded stdlib module passthrough (`import "semver" as __std_semver;`), `.matrix` & `.mt` sources, `enum` + exhaustive `match`, destructuring `let (a, b) = ...`, bare `catch e`, C-style `for let`, and `line_map` / `map_line`.
- `wasmworker.js` and `wasmhost.template.html` load definitions once into a **persistent `spid3r.wasm` v1.5.0 session** (`sp.evalSession(..., 'vm')`) and dispatch events via `__studio_dispatch(evJson)` (with stateless `sp.eval()` fallback).
- Each turn exchanges an envelope (`event`, `router`, `state`, `storage`, `theme`, `i18n`, `slot_nonce`, `frame_epoch`, `caps`) and returns an atomic `@@STUDIO_FRAME@@` payload (`css`, `html`, `html_hash`, `storage_version`, `effects`).

---

## 4. MVC Desktop Control Panel (`core/gui/`)

- **Model (`core/gui/models/StudioModel.matrix`):** Tracks the 5-tier inventory, active project, editor buffer, notifications, documentation catalog, and version constants from `core/Version.matrix`.
- **Controller (`core/gui/controllers/StudioController.matrix`):** Coordinates project switching/creation, BOM-safe saving, `spid3r fmt`, strict checks + `Diagnostics.matrix` analysis, `Recovery.matrix`, builds, and log/report export.
- **Views (`core/gui/Shell.matrix` + `core/gui/pages/*.matrix`):** Fixed sidebar + top bar + 6 views (`Workspace`, `Editor`, `Platforms`, `Doctor`, `Tests`, `Docs`) + bottom Console/Diagnostics/Alerts drawer.

---

## 5. Security & Verification Gates

Every Web/Android/iOS build runs `BuildWeb.verify_flat_bundle()`:
1. **Secret Scanner (`BuildWeb.scan_secrets`):** Blocks hardcoded AWS/GitHub/Stripe/Slack/Google API keys and PEM private key blocks.
2. **Strict Compiler Gate (`spid3r check --deny-warnings`):** Compiles the exact flattened bundle with warnings promoted to errors.
3. **Supply-Chain Integrity:** `Exec.sha256_file()` and `Exec.sri_sha256_attr()` compute native SHA-256 digests and SRI attributes for `spid3r.js`; `--release` emits CycloneDX 1.5 `sbom.json`.
4. **Web Hardening:** Per-build CSP nonce (`nonce-{{APP_CSP_NONCE}}`), `require-trusted-types-for 'script'`, `trusted-types appstudio`, SHA-256 SRI, and configurable `connect-src`.

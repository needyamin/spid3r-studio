# Spid3r Studio — `studio.json` & CLI Configuration Reference

## 1. `studio.json` Manifest Schema

Place `studio.json` at the root of each application directory (`workspace/<AppName>/studio.json`):

```json
{
  "name": "Studio Demo",
  "bundleID": "sh.appstudio.demo",
  "version": "1.0.0",
  "entry": "main.matrix",
  "icon": "assets/logo.svg",
  "theme": {
    "mode": "light",
    "primary": "#4f46e5"
  },
  "deepLinks": ["studiodemo"],
  "auth": {
    "redirectScheme": "studiodemo-auth"
  },
  "security": {
    "connectSrc": ["https://api.example.com"]
  },
  "android": {
    "minSdk": 24,
    "targetSdk": 34,
    "compileSdk": 34,
    "versionCode": 1,
    "cleartext": false,
    "cleartextDomains": []
  },
  "ios": {
    "deploymentTarget": "17",
    "allowsArbitraryLoads": false,
    "orientations": [
      "UIInterfaceOrientationPortrait",
      "UIInterfaceOrientationLandscapeLeft",
      "UIInterfaceOrientationLandscapeRight"
    ]
  }
}
```

### Field Reference

| Field | Default | Notes |
| :--- | :--- | :--- |
| `name` | Folder name | Human-readable application and window title. |
| `bundleID` | `com.example.<name>` | Validated reverse-DNS identifier (required for Android/iOS). |
| `version` | `"1.0.0"` | Semantic version string (used in desktop/mobile manifests & `sbom.json`). |
| `entry` | `main.matrix` / `app.matrix` | Native entry `.matrix` or `.mt` file. |
| `icon` | `""` | Relative or absolute path to `.svg`, `.png`, or `.ico` icon asset. |
| `theme.mode` / `theme.primary` | `"light"` / `"#4f46e5"` | Initial WASM host theme & PWA `<meta name="theme-color">`. |
| `deepLinks` / `auth.redirectScheme` | `[]` / `""` | Custom URL schemes registered in Android `AndroidManifest.xml` and iOS `Info.plist` (`http`/`https`/`javascript` rejected). |
| `security.connectSrc` | `[]` | Additional origins appended to Web/PWA CSP `connect-src`. |
| `android.*` | `24` / `34` / `34` / `1` / `false` | SDK pins, integer `versionCode`, and opt-in cleartext HTTP policy. |
| `ios.*` | `"17"` / `false` / portrait+landscape | SwiftPM iOS deployment target (`13`–`18`), ATS policy, and supported orientations. |

---

## 2. CLI Commands (`spid3r run studio.matrix <command>`)

| Command | Description |
| :--- | :--- |
| `gui [appdir]` | Launch the native Desktop MVC Control Panel GUI. |
| `new <AppName> [outdir]` | Scaffold a new self-contained app with vendored `vendor/studio/` and `targets/host.html`. |
| `run <appdir> [--engine E] [--devtools]` | Run native desktop WebView preview (`E = tree` \| `vm`). |
| `dev <appdir> [--target T] [--engine E] [--devtools]` | Hot-reload desktop window, live-reload Web/PWA server (`--target web [--host IP] [--port N] [--once]`), or iOS deploy (`--target ios`). |
| `check <appdir>` | Run static compiler verification across the project. |
| `build <appdir> [--target T] [-o out] [--release]` | Package for `web` (default), `desktop`, `android`, or `ios`. `--release` hardens CSP/desktop launcher and emits `sbom.json`. |
| `ios <subcommand>` | Manage `xtool 1.24.0`, Darwin SDK (`sdk-install <Xcode.xip>`), USB devices (`devices`), status (`status`), and `.ipa` installation (`run <appdir>`). |
| `test [filter] [--all]` | Run `spid3r fmt --check`, strict `spid3r check --deny-warnings`, and all `core/tests/*.matrix` suites (`--all` includes every project under `workspace/`). |
| `clean [appdir] [--cache]` | Remove `build/`, transient flags, and (with `--cache`) `downloads/wasm-runtime/`. |
| `upgrade <appdir>` | Refresh project `vendor/studio/` and `targets/host.html` from `frameworks/`. |
| `doctor` | Audit `spid3r`, `spkg`, `yamc`, WASM cache, iOS (`xtool`/Swift/Darwin SDK), and Android (`java`/`gradle`/`adb`/`ANDROID_HOME`). |
| `help` | Print CLI usage summary. |

---

## 3. Environment Variables

| Variable | Effect |
| :--- | :--- |
| `APPSTUDIO_HOME` | Override AppStudio framework root directory (used by `Fs.fw_root()` and `FlatKit`). |
| `SPID3R_PATH` | Semicolon/colon-separated module search directories (auto-configured by `Fs.setup_import_path()`). |
| `STUDIO_VERSION_CODE` | Override Android/iOS integer `versionCode` during CI builds. |
| `STUDIO_DESKTOP_SIGN_CMD` | Command executed to sign `--release` desktop binaries (`{{BINARY}}` placeholder supported). |
| `STUDIO_DRY_RUN` | Set `1` or `true` to skip background toolchain scans in headless GUI dry-runs. |

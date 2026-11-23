# Spid3r Studio — `studio.json` & CLI Configuration Reference

## 1. `studio.json` Manifest Schema

```json
{
  "name": "Studio Demo",
  "bundleID": "sh.appstudio.demo",
  "version": "1.0.0",
  "entry": "main.matrix",
  "icon": "assets/logo.svg",
  "theme": {
    "mode": "dark",
    "primary": "#6366F1"
  },
  "android": {
    "minSdk": 24,
    "targetSdk": 34,
    "versionCode": 1
  },
  "ios": {
    "deploymentTarget": "16.0"
  }
}
```

## 2. CLI Commands (`spid3r run studio.matrix <command>`)

| Command | Description |
| :--- | :--- |
| `gui [appdir]` | Launch the native Desktop Spid3r Studio Control Panel GUI |
| `new <AppName> [outdir]` | Scaffold a new project (defaults to `workspace/<AppName>` via GUI or `<AppName>` via CLI) |
| `run <appdir>` | Run native desktop WebView preview |
| `dev <appdir> [--target web\|ios]` | Live hot-reload desktop window, Web/PWA dev server (`--host`, `--port`), or iOS device deploy |
| `check <appdir>` | Run static compiler verification across the project |
| `build <appdir> --target <target>` | Package for `web`, `desktop` (Windows/macOS/Linux), `android`, or `ios` |
| `ios <subcommand>` | Manage `xtool 1.24.0`, Darwin SDK (`sdk-install`), USB devices, and `.ipa` installation |
| `test [filter]` | Verify `spid3r fmt --check`, `--deny-warnings` across all `.matrix` files, and run test suites |
| `clean [appdir] [--cache]` | Remove `build/` artifacts and optionally clear cached runtimes |
| `upgrade <appdir>` | Sync project `vendor/studio/` and `targets/host.html` with the latest framework |
| `doctor` | Audit host OS, Spid3r, Web, iOS, and Android toolchains |

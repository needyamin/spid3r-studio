# Spid3r Studio — Getting Started Guide

Welcome to **Spid3r Studio (v1.5.0)**, the cross-platform application development environment for building **iOS**, **Android**, **Windows**, **macOS**, **Linux**, and **Web/PWA** applications from a single `.matrix` / `.mt` codebase.

---

## 1. Prerequisites

1. **Install Spid3r v1.5.0+** (`spid3r` and `sp` on `PATH`):
   - **Windows:** Install from the [Microsoft Store](https://apps.microsoft.com/detail/9NPH5XX0F6KF) (`9NPH5XX0F6KF`) or run `Spid3r-Setup-<version>.exe` from [Spid3r Releases](https://github.com/needyamin/spid3r/releases).
   - **Linux / macOS:**
     ```sh
     curl -fsSL https://raw.githubusercontent.com/needyamin/spid3r/main/install.sh | sh
     ```
2. **Optional target toolchains:**
   - **Web / PWA & Desktop:** Zero extra tools required (`spid3r` includes the desktop WebView host, AOT compiler, and WASM runtime).
   - **Android:** JDK 17+, Gradle 8.5+, Android SDK (`ANDROID_HOME`), and `adb`.
   - **iOS (without a Mac):** `xtool 1.24.0`, Swift 6.x (via WSL2 on Windows or native Linux), Darwin Swift SDK (`Xcode.xip`), and `usbmuxd`/`ideviceinstaller`.
3. **Verify setup** from the repository root:
   ```powershell
   spid3r run studio.matrix doctor
   ```

---

## 2. 5-Tier A–Z Directory Architecture

Spid3r Studio organizes your environment into five top-level directories:

1. **`frameworks/`** — Core UI framework (`frameworks/studio/`), 6-OS target SDK templates (`frameworks/targets/`), starter templates (`frameworks/templates/`), and `registry.json`.
2. **`downloads/`** — Managed toolchains (`xtool 1.24.0`, `Xcode.xip`), versioned `spid3r.wasm` runtime cache (`downloads/wasm-runtime/<version>/`), and `packages/catalog.json`.
3. **`documents/`** — Developer Handbook (`documentation.html`), guides (`guides/`), tutorials (`tutorials/`), configuration reference (`references/`), logs (`logs/`), and QA reports (`reports/`).
4. **`workspace/`** — Your dedicated application workspace (`workspace/demo/` showcase app plus your own projects).
5. **`core/`** — CLI commands (`core/cli/`), FlatKit bundler (`core/tools/`), MVC Control Panel (`core/gui/`), diagnostics, recovery, and automated test suites (`core/tests/`).

---

## 3. Launching the MVC Control Panel GUI

- **Windows Double-Click:** Open `AppStudio.bat`.
- **Command Line:**
  ```powershell
  spid3r run studio.matrix gui
  ```

Inside the Control Panel:
- **Workspace:** Browse the 5 tiers, switch active projects, or scaffold a new app in `workspace/<AppName>`.
- **Code & Debugger:** Edit `.matrix`/`.mt` or `studio.json`, run **Compile & Check**, auto-format with `spid3r fmt`, or trigger **1-Click Recovery**.
- **Platforms (6 OS):** Preview on Desktop, launch the live-reload Web/PWA LAN server, build/install an iOS `.ipa`, or assemble an Android APK.
- **Downloads & SDKs:** Audit missing dependencies and install managed SDKs.
- **Tests & QA:** Run the full formatting, static check, and test pipeline.
- **Docs & Logs:** Read documentation, inspect `core/Plugins` extensions, and export diagnostic reports.

---

## 4. Your First App via CLI

```powershell
# 1. Create a new project in workspace/
spid3r run studio.matrix new HelloStudio workspace/HelloStudio

# 2. Preview on your desktop with hot reload
spid3r run studio.matrix dev workspace/HelloStudio

# 3. Preview on your phone over Wi-Fi (Web/PWA WASM server)
spid3r run studio.matrix dev workspace/HelloStudio --target web --host 0.0.0.0 --port 8080

# 4. Build for production
spid3r run studio.matrix build workspace/HelloStudio --target web --release
spid3r run studio.matrix build workspace/HelloStudio --target desktop --release
spid3r run studio.matrix build workspace/HelloStudio --target android
spid3r run studio.matrix build workspace/HelloStudio --target ios
```

---

## 5. Next Steps

- Learn the language & framework patterns in the [Spid3r v1.5.0 `.matrix` Tutorial](../tutorials/matrix-language-tutorial.md).
- Master the daily dev loop & release workflow in the [Development Workflow Guide](development-workflow.md).
- Check all manifest keys and CLI options in the [Configuration Reference](../references/configuration-reference.md).

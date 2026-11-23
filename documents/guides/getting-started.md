# Spid3r Studio — Getting Started Guide

Welcome to **Spid3r Studio**, the cross-platform application development environment for building **iOS**, **Android**, **Windows**, **macOS**, **Linux**, and **Web/PWA** applications from a single `.matrix` codebase.

## 1. A–Z Directory Architecture

Spid3r Studio organizes your environment into five clean tiers:

1. **`frameworks/`** (paired with `studio/`, `targets/`, `templates/`): Core UI components, router, state, storage, theme tokens, host bridges, and platform SDK templates.
2. **`downloads/`**: Dedicated storage for large toolchains, SDK installers, `xtool 1.24.0`, and cached `spid3r.wasm` runtime binaries.
3. **`documents/`**: Developer guides (`guides/`), tutorials (`tutorials/`), configuration references (`references/`), persistent build logs (`logs/`), and QA reports (`reports/`).
4. **`workspace/`**: Your dedicated development workspace where new projects are created, edited, compiled, tested, and packaged.
5. **`core/`** (paired with `cli/`, `tools/`, `gui/`): Application engine, compiler diagnostics, automated failure recovery, plugin registry, FlatKit bundler, and the MVC Control Panel GUI.

## 2. Launching the Control Panel GUI

- **Windows Double-Click:** Run `AppStudio.bat`
- **Command Line:**
  ```powershell
  spid3r run studio.matrix gui
  ```

## 3. Core Workflow

1. **Create or Select a Project:** Open the **Workspace** tab in the Control Panel to create a new app in `workspace/<AppName>` or switch between projects.
2. **Edit & Debug `.matrix` Code:** Open **Code & Debugger** to browse project files, edit `.matrix` source or `studio.json`, run **Compile & Check**, auto-format code, or trigger **1-Click Recovery**.
3. **Build & Deploy to 6 Platforms:** Open **Platforms** to preview on Desktop (Windows/macOS/Linux), start the live Web/PWA LAN server, build/install a signed iOS `.ipa`, or assemble/deploy an Android `.apk`.
4. **Manage Downloads & SDKs:** Open **Downloads & SDKs** to probe toolchains and run 1-click dependency installers.

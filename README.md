# Spid3r Studio (AppStudio)

**One `.matrix` Codebase. Six Native & Web Platforms. Zero Runtime Dependencies for Built Apps.**

**Spid3r Studio** is a production-ready cross-platform application development environment, declarative UI framework, and **MVC Control Panel GUI** built natively in [Spid3r v1.1.1](https://github.com/needyamin/spid3r/releases/tag/v1.1.1). Build, debug, and ship high-performance apps for **iOS**, **Android**, **Windows**, **macOS**, **Linux**, and **Web / Mobile PWA** from a single `.matrix` source tree — even signing and deploying iOS `.ipa` apps to a real iPhone without a Mac.

---

## Why Spid3r Studio?

- **True 6-OS Reach:** Compile native desktop executables (Windows, macOS, Linux), offline-ready WebAssembly PWAs, Android Gradle/Kotlin APKs, and signed iOS SwiftPM `.ipa` packages from one declarative `app.matrix`.
- **Full MVC Desktop Control Panel:** Manage your entire workflow visually — project creation, built-in `.matrix` code editor, live compiler diagnostics, smart fix suggestions, 1-click failure recovery, toolchain downloads, and real-device deployment.
- **No-Mac iOS Deployment:** Integrated `xtool 1.24.0` + Darwin Swift SDK + chunked USB installer builds, signs, and installs `.ipa` packages directly onto physical iPhones from Windows/WSL2 or Linux.
- **Clean 5-Folder A–Z Architecture:** Strictly organized into `frameworks/`, `downloads/`, `documents/`, `workspace/`, and `core/`.

---

## Prerequisites — Install Spid3r

**Spid3r Studio is authored in Spid3r v1.1.1 (`.matrix`).** The Spid3r v1.1.1 language/runtime and its `spid3r` CLI must be installed and on your PATH before **any** `spid3r run studio.matrix ...` command will work — including the Control Panel and every command in the quick start below.

### Windows — recommended one-click install

Download and run the official installer: [Spid3r-Setup-1.1.1.exe](https://github.com/needyamin/spid3r/releases/download/v1.1.1/Spid3r-Setup-1.1.1.exe).

### All platforms — release page

The [Spid3r v1.1.1 release](https://github.com/needyamin/spid3r/releases/tag/v1.1.1) is marked **Latest** and includes prebuilt `spid3r` binaries and checksums.

### Linux / macOS

```sh
curl -fsSL https://raw.githubusercontent.com/needyamin/spid3r/main/install.sh | sh
```

If `spid3r` is not recognized after installing, reopen your terminal once to refresh PATH.

### Verify your setup

Run the environment audit **from the repository root**:

```powershell
spid3r run studio.matrix doctor
```

New to the language? Start with the [Spid3r `.matrix` language tutorial](documents/tutorials/matrix-language-tutorial.md).

---

## 30-Second Quick Start

### 1. Launch the Visual Control Panel
Double-click **`AppStudio.bat`** on Windows, or run:

```powershell
spid3r run studio.matrix gui
```

### 2. Or Build & Run from the CLI

```powershell
spid3r run studio.matrix new MyApp workspace/MyApp      # Create a new project in workspace/
spid3r run studio.matrix dev workspace/demo             # Live hot-reload desktop window
spid3r run studio.matrix dev workspace/demo --target web # Wi-Fi Web/PWA server for phones
spid3r run studio.matrix build workspace/demo --target desktop
spid3r run studio.matrix build workspace/demo --target android
spid3r run studio.matrix ios run workspace/demo         # Build, sign & install .ipa on iPhone
spid3r run studio.matrix test                           # Format check + strict compiler + 5 test suites
```

---

## Clean 5-Tier Project Structure

![Spid3r Studio 5-Tier Architecture & 6-Platform Pipeline](documents/diagrams/architecture-overview.svg)

```text
AppStudio/
├── frameworks/     # Declarative UI framework (studio/), 6-OS target SDKs (targets/), starter templates
├── downloads/      # Managed toolchains (xtool 1.24.0), cached spid3r.wasm runtime & SDK installers
├── documents/      # Developer Handbook (documentation.html), SVG diagrams, guides, logs & reports
├── workspace/      # Dedicated developer workspace (workspace/demo showcase & your apps)
└── core/           # MVC Control Panel (gui/), CLI driver (cli/), FlatKit bundler, Diagnostics & Recovery
```

![Spid3r Studio MVC Control Panel Architecture](documents/diagrams/mvc-control-panel.svg)

---

## Documentation & Resources

- **[Complete Developer Handbook & Architecture Guide](documents/documentation.html)** — Open `documents/documentation.html` in any browser (or inside the Control Panel's **Docs & Logs** tab) for full developer guidelines, `.matrix` authoring rules, component APIs, and 6-OS deployment workflows.
- **[MIT License & Third-Party Notices](LICENSE.md)** — Free and open-source software under the MIT License with third-party compliance boundaries.
- **[Spid3r v1.1.1 Language Release](https://github.com/needyamin/spid3r/releases/tag/v1.1.1)** — Windows installer, Linux/macOS CLI binaries, and checksums.

# Spid3r Studio (AppStudio) — License, Third-Party Notices & Legal Compliance

This document governs the licensing of **Spid3r Studio (AppStudio)** source code and provides mandatory third-party software attribution, license boundary declarations, SDK compliance rules, and trademark disclaimers for all integrated technologies.

---

## Part 1 — Spid3r Studio Source Code License (MIT License)

Copyright (c) 2026 Spid3r Studio (AppStudio) Contributors & needyamin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## Part 2 — Third-Party Software Notices & License Boundaries

Spid3r Studio orchestrates multiple external compilers, runtimes, OS bridges, and platform SDKs. To ensure full legal compliance and prevent license contamination (such as GPL/LGPL copyleft obligations or proprietary SDK redistribution), **Spid3r Studio does not statically link or redistribute proprietary or copyleft binaries in its source repository.** Large toolchains and SDKs are downloaded on demand by the end user into the Git-ignored `downloads/` directory or invoked as separate operating-system processes.

### 1. Spid3r Programming Language, Compiler & Runtime (`spid3r`, `spid3r.wasm`)
- **Component:** Spid3r CLI, AOT/Bytecode compiler, `spid3r.wasm` / `spid3r.js` WebAssembly runtime, and `spid3r gui` native window runner.
- **Upstream & Underlying Technologies:** ANSNEW TECH / Spid3r Contributors; built with LLVM (Apache-2.0 WITH LLVM-exception) and Tauri `tao` / `wry` windowing & WebView bindings (Apache-2.0 / MIT).
- **Compliance Boundary:** Invoked via the system `spid3r` binary; cached WASM assets in `downloads/wasm-runtime/` are excluded from version control.

### 2. Apple Xcode, Darwin iOS SDK & Apple Frameworks (`Xcode.xip`, `WKWebView`)
- **Component:** Apple Darwin iOS SDK (`Xcode.xip`), `WebKit` (`WKWebView`, `WKURLSchemeHandler`), and `SwiftUI` host templates (`frameworks/targets/ios/*.tmpl`).
- **License:** [Apple Xcode and Apple SDKs Agreement](https://www.apple.com/legal/sla/docs/xcode.pdf) (Proprietary — Apple Inc.).
- **Strict Redistribution Prohibition:** Apple's license strictly prohibits redistributing `Xcode.xip` or extracted Apple iOS SDK binaries to third parties. Accordingly, **`*.xip` and `downloads/installers/` are permanently excluded via `.gitignore` and must never be committed or hosted in public repositories.** Each developer must download `Xcode.xip` directly from their own authenticated [Apple Developer](https://developer.apple.com/download/all/) account and accept Apple's terms.

### 3. xtool Cross-Platform iOS Builder (`xtool-org/xtool`)
- **Component:** `xtool` AppImage (`1.24.0`) used for cross-platform SwiftPM iOS package building and Apple ID codesigning.
- **Upstream:** [https://github.com/xtool-org/xtool](https://github.com/xtool-org/xtool)
- **License:** MIT License / Apache License 2.0 (see upstream repository for embedded binary notices).
- **Compliance Boundary:** Downloaded on demand by the user into `downloads/xtool/` (excluded from Git via `.gitignore`) and executed as an isolated child process.

### 4. Swift Compiler Toolchain & Swiftly (`swift`, `swiftly`)
- **Component:** Swift compiler, Swift Package Manager (SwiftPM), and `swiftly` toolchain installer.
- **Upstream:** [https://www.swift.org](https://www.swift.org) (Apple Inc. and the Swift project authors).
- **License:** **Apache License 2.0 with Runtime Library Exception**.

### 5. libimobiledevice, `usbmuxd` & `ideviceinstaller`
- **Component:** Linux/WSL2 iOS USB communication daemon (`usbmuxd`) and mobile device communication libraries (`libimobiledevice-1.0.so.6`, `ideviceinstaller`).
- **Upstream:** [https://libimobiledevice.org](https://libimobiledevice.org)
- **License:** **GNU Lesser General Public License v2.1+ (LGPL-2.1-or-later)** (`libimobiledevice`) and **GNU General Public License v2+ (GPL-2.0-or-later)** (`usbmuxd` daemon and CLI utilities).
- **Compliance Boundary:** Spid3r Studio does not bundle, modify, or statically link `libimobiledevice` or `usbmuxd`. The helper script `core/tools/ios_install_ipa.py` loads the user's OS-installed shared library (`libimobiledevice-1.0.so.6`) dynamically at runtime via Python `ctypes` and invokes `usbmuxd` as an external system daemon, fully satisfying LGPL v2.1 dynamic-linking requirements and GPL process-separation rules.

### 6. `usbipd-win` Windows USB-to-WSL2 Bridge (`dorssel/usbipd-win`)
- **Component:** Windows USB/IP server passing USB devices to WSL2 (`usbipd.exe`).
- **Upstream:** [https://github.com/dorssel/usbipd-win](https://github.com/dorssel/usbipd-win) (Frans van Dorsselaer).
- **License:** **GNU General Public License v3.0 (GPL-3.0-only)**.
- **Compliance Boundary:** Installed separately by the user via Windows Package Manager (`winget install dorssel.usbipd-win`) and invoked solely as an unmodified external command-line executable ("mere aggregation" / separate process execution under GPLv3).

### 7. Android SDK, ADB, AndroidX & Kotlin
- **Component:** Android Platform-Tools (`adb`), Android SDK, Kotlin standard library, and AndroidX Jetpack libraries (`androidx.webkit:webkit`, `androidx.activity:activity-ktx`, `androidx.core:core-ktx`, `com.google.android.material:material`) referenced in `frameworks/targets/android/*.tmpl`.
- **Upstream:** Google LLC (Android Open Source Project) and JetBrains s.r.o. (Kotlin).
- **License:** **Apache License 2.0** (source libraries and templates); Android SDK preview/platform packages are subject to the [Android Software Development Kit License Agreement](https://developer.android.com/studio/terms) accepted by the developer upon installing Android Studio or Platform-Tools.

### 8. Gradle Build Tool & Microsoft OpenJDK 17
- **Component:** Gradle build automation tool and Java Development Kit 17+.
- **Upstream & Licenses:**
  - **Gradle:** [https://gradle.org](https://gradle.org) — **Apache License 2.0**.
  - **Microsoft Build of OpenJDK:** [https://www.microsoft.com/openjdk](https://www.microsoft.com/openjdk) — **GNU General Public License v2 with the Classpath Exception (GPL-2.0-with-classpath-exception)**.
- **Compliance Boundary:** Installed externally by the user and invoked via CLI (`gradle assembleDebug`, `java -version`). The Classpath Exception explicitly permits compiling and running independent application code without copyleft propagation.

### 9. Native Desktop WebView Engines
- **Windows:** Microsoft Edge WebView2 Runtime — provided by Windows OS under the Microsoft Edge WebView2 License Terms.
- **macOS:** Apple `WKWebView` — provided by macOS system frameworks.
- **Linux:** `WebKitGTK` — **GNU LGPL v2+ / BSD-2-Clause**, dynamically linked via the host Linux distribution's system packages.

---

## Part 3 — Mandatory Developer Compliance Checklist before Redistribution

If you redistribute, publish, or open-source a fork of Spid3r Studio or an application built with it, observe these rules:

1. **Never commit or redistribute `Xcode*.xip` or Apple Darwin SDK files:** Keep `downloads/installers/`, `downloads/xtool/`, `downloads/wasm-runtime/`, and `*.xip` in `.gitignore`.
2. **Retain Copyright & License Notices:** Keep this `LICENSE.md` file intact in source distributions.
3. **Comply with App Store & Play Store Policies:** Applications compiled to `.ipa` or `.apk` remain your sole responsibility and must comply with the Apple Developer Program License Agreement and Google Play Developer Distribution Agreement.
4. **Do Not Bundle GPL Executables Inside Proprietary Installers Without Source Offers:** If you create a commercial all-in-one installer that bundles `usbipd-win` (GPLv3) or `usbmuxd` (GPLv2) binaries directly inside your installer archive, you must provide their corresponding upstream source code and GPL license texts. Keeping them as external `winget` / `apt` downloads avoids any GPL bundling obligations.

---

## Part 4 — Trademark & Non-Affiliation Disclaimer

- **Apple®, iOS®, iPhone®, iPad®, macOS®, Xcode®, Swift™, and WKWebView** are trademarks or registered trademarks of Apple Inc., registered in the U.S. and other countries.
- **Google®, Android™, Google Play™, and WebView** are trademarks of Google LLC.
- **Kotlin®** is a registered trademark of the Kotlin Foundation / JetBrains s.r.o.
- **Microsoft®, Windows®, PowerShell®, Winget, and Edge WebView2** are trademarks or registered trademarks of Microsoft Corporation.
- **Linux®** is the registered trademark of Linus Torvalds in the U.S. and other countries.
- **Gradle®** is a registered trademark of Gradle, Inc.

**Spid3r Studio (AppStudio)** is an independent open-source software development framework and is **not affiliated with, endorsed by, sponsored by, or certified by** Apple Inc., Google LLC, Microsoft Corporation, JetBrains s.r.o., Gradle Inc., or any other trademark holder listed above. All product and company names are used strictly for technical interoperability and identification purposes (nominative fair use).

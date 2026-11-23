# AppStudio

**A zero-dependency cross-platform UI framework + CLI written in [spid3r](https://needyamin.github.io/spid3r/) — one `app.matrix` for Desktop, Web, Android, and iOS.**

Write your UI declaratively in spid3r, preview it live on your desktop or browser with hot reload, then package the same code for Web, Android, iOS (without requiring a Mac via `xtool`), and Desktop.

```powershell
spid3r run studio.matrix new MyApp                     # scaffold a self-contained app
spid3r run studio.matrix run examples/demo             # preview in a native webview
spid3r run studio.matrix dev examples/demo             # hot-reload native preview
spid3r run studio.matrix dev examples/demo --target web # local HTTP dev server + watcher
spid3r run studio.matrix build examples/demo --target android
spid3r run studio.matrix build examples/demo --target ios
spid3r run studio.matrix build examples/demo --target web
spid3r run studio.matrix build examples/demo --target desktop
spid3r run studio.matrix test                          # fmt --check, check --deny-warnings, all test suites
```

---

## How an App Looks

Apps split cleanly into `app.matrix` (pages, handlers, `studio_app()`) + optional `pages/` submodules, a thin `main.matrix` (entry `gui_*` shims), and `studio.json`:

**`app.matrix` — author file (no `main`):**

```spid3r
import "vendor/studio/App" as appkit;
import "vendor/studio/Components" as ui;
import "vendor/studio/State" as state;
import "vendor/studio/Storage" as storage;

fn load_taps() {
    state.set("taps", int(storage.get("taps", 0)));
}

fn add_tap(_ev) {
    state.incr("taps", 1);
    storage.set("taps", state.get("taps"));
}

fn Home() -> map {
    let n = int(state.get_or("taps", 0));
    return ui.page([
        ui.navbar("MyApp"),
        ui.card([
            ui.text("Taps: {n}", "h1"),
            ui.spacer(6),
            ui.button("Tap me", "add_tap"),
        ]),
    ]);
}

public fn studio_app() {
    return appkit.App("MyApp", "com.example.myapp", "0.1.0")
        .page("Home", Home)
        .handler("add_tap", add_tap)
        .boot(load_taps);
}
```

**`main.matrix` — native entry (five one-line shims + `.run()`):**

```spid3r
import "app" as appdef;

fn studio_title(t: string) { gui_title(t); }
fn studio_html(h: string) { gui_set_html(h); }
fn studio_eval(js: string) { gui_eval(js); }
fn studio_on(n: string, cb) { gui_on(n, cb); }
fn studio_emit(n: string, p: string) { gui_emit(n, p); }

fn main() -> int {
    return appdef.studio_app()
        .bridge(studio_title, studio_html, studio_eval, studio_on, studio_emit)
        .run();
}
```

> Why shims? `spid3r` links `gui_*` natives **only inside the entry file** of a `spid3r gui` program. The shims hand those five natives to `Bridge`; everything else stays pure framework code.

## Programming Model & Components

- **Pages** return declarative component trees (`ui.*` helpers returning plain map nodes).
- **Handlers** accept `ev = { "sid", "kind", "value", "arg" }` as registered named handlers (`app.handler(name, fn)`) or inline closures. For WASM/mobile async HTTP callbacks (`Http.get_async`, etc.), register a named handler string.
- **Keyed Morphing:** Pass `"key": "..."` in props to reuse DOM nodes across reorders and preserve focus/caret + mid-typing input text.
- **Disabled & ARIA:** Interactive controls accept `"disabled": true`, `"aria_label": "..."`, and `"role": "..."`.
- **Navigation:** `nav.push(page, params)`, `nav.pop()`, `nav.replace(...)`, tabs via `.tab_pages(...)`. Hardware Back pops automatically when `depth > 1`.
- **Host Effects & Caps:** `Bridge.copy_text`, `Bridge.open_url`, `Bridge.haptic`, `Bridge.platform()`, `Bridge.prefers_dark()`, and `Http.*_async`.
- **Manifest (`studio.json`):** Supports `name`, `bundleID`, `version`, `entry`, `icon`, `theme` (`mode`, `primary`), `android` (`minSdk`, `targetSdk`, `versionCode`), `ios` (`deploymentTarget`), plus automatic `<appdir>/assets/` copying across all targets.

### Component Reference (`studio/Components.matrix`)

| Category | Primitives |
|---|---|
| Layout | `page`, `column`, `row`, `grid(children, cols, gap)`, `scroll`, `center`, `spacer`, `flex_spacer`, `divider`, `node` |
| Text & Chrome | `text(t, style)` (`h1 h2 h3 title subtitle body caption muted mono bold`), `title`, `subtitle`, `caption`, `navbar`, `tabbar`, `fab` |
| Buttons & Tags | `button(label, onTap, variant, props)` (`primary secondary danger outline ghost`), `iconbutton`, `chip(label, onTap, selected)` |
| Inputs & Forms | `form(children, onSubmit)`, `input`, `textarea`, `checkbox`, `select` / `picker`, `segmented`, `toggle`, `slider` |
| Feedback & Overlays | `progress`, `spinner`, `dialog`, `confirm`, `toast`, `sheet` |
| Media & Data | `image`, `avatar`, `badge`, `list`, `listtile`, `empty`, `html` (trusted passthrough) |

## Targets

| Target | Command | Output | Runtime Mechanism |
|---|---|---|---|
| **Native preview** | `studio run` / `dev` | Native webview window | `spid3r gui` + bridge natives (`dev` watches sources & reloads) |
| **Web dev** | `studio dev <app> --target web` | `build/web/` over HTTP | Built-in `cli/DevWeb.matrix` HTTP server + source watcher |
| **Web** | `build --target web` | `build/web/` | `tools/FlatKit.matrix` bundle + `wasmworker.js` + `spid3r.wasm` + `index.html` |
| **Android** | `build --target android` | `build/android/AndroidApp/` | Kotlin `WebViewAssetLoader` + `OnBackPressedCallback` + `spid3r.wasm` |
| **iOS** | `build --target ios` | `build/ios/<Name>/` | SwiftPM + `WKURLSchemeHandler` (`appstudio://app/`) + `xtool.yml` |
| **Desktop** | `build --target desktop` | Single executable (`<Name>.exe`) | `spid3r compile` bytecode + `--embed host.html` + `--bundle-runtime` |

## Directory Layout

```
studio.matrix               Slim CLI router (new/run/dev/check/build/test/clean/upgrade/doctor)
studio/                     Core framework modules (App, Bridge, ClientJS, Components, CSS, Http, Render, Router, State, Storage, Theme, Util)
cli/                        Modular CLI commands (Args, Build*, DevWeb, Doctor, Dx, Exec, Fs, Manifest, New, RunDev)
tools/FlatKit.matrix        Lexer-aware multi-file bundler & symbol isolator
targets/                    host.html, wasmhost.template.html, wasmworker.js, android/*.tmpl, ios/*.tmpl
templates/starter/          `studio new` starter app & spider.toml templates
examples/demo/              Multi-file showcase app (pages/Home, Detail, Stats, assets/logo.svg, studio.json)
tests/                      framework.matrix, security.matrix, flatkit.matrix, wasm_protocol.matrix
```

## CLI Reference

```powershell
spid3r run studio.matrix new <Name> [outdir]
spid3r run studio.matrix run <appdir>
spid3r run studio.matrix dev <appdir> [--target web] [--port N]
spid3r run studio.matrix check <appdir>
spid3r run studio.matrix build <appdir> [--target web|android|ios|desktop] [-o DIR]
spid3r run studio.matrix test [filter]
spid3r run studio.matrix clean [appdir] [--cache]
spid3r run studio.matrix upgrade <appdir>
spid3r run studio.matrix doctor
spid3r run studio.matrix help
```

All commands run from the framework root (or anywhere when `APPSTUDIO_HOME` points to it).

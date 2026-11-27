# Writing `.matrix` / `.mt` Applications in Spid3r v1.5.0

**Spid3r v1.5.0** is a gradually typed language (`.matrix` / `.mt`) with four unified backends (`tree`, `vm`, `native`, and `wasm`). Follow these idioms when building Spid3r Studio applications.

---

## 1. App Structure (`app.matrix` + `main.matrix` + `studio.json`)

Every AppStudio project has three core files:
- **`studio.json`**: App metadata (`name`, `bundleID`, `version`, `entry`, `theme`, `deepLinks`, `security`, `android`, `ios`).
- **`app.matrix`**: Platform-agnostic UI pages, event handlers, and `public fn studio_app()`.
- **`main.matrix`**: Thin native desktop entry passing `gui_*` and window shims into `.bridge(...)` and `.window_bridge(...)`.

---

## 2. Declarative UI, State & `enum` / `match` Example

Spid3r v1.5.0 supports `enum` sum types with exhaustive `match`, nullable types (`T?`), named imports (`import { a, b } from "...";`), and 26 embedded stdlib modules across both Desktop and WASM:

```spid3r
import "studio/App" as appkit;
import "studio/Components" as ui;
import "studio/State" as state;
import "studio/Storage" as storage;
import "semver" as sv;

public enum FilterMode {
    All,
    Active,
    Tagged(tag),
}

fn filter_label(m) -> string {
    return match (m) {
        FilterMode.All => "All Items",
        FilterMode.Active => "Active Only",
        FilterMode.Tagged(tag) => "Tag: " + tag
    };
}

fn Home() -> map {
    let count = int(state.get_or("count", 0));
    let mode = FilterMode.Tagged("v" + sv.parse("1.5.0")["major"].to_string());
    return ui.page([
        ui.navbar("My App"),
        ui.card([
            ui.title("Count: {count}"),
            ui.caption(filter_label(mode)),
            ui.row([
                ui.button("Increment", (_ev) => {
                    let next = count + 1;
                    state.set("count", next);
                    storage.set("count", next);
                }, "primary"),
                ui.button("Reset", (_ev) => {
                    state.set("count", 0);
                    storage.set("count", 0);
                }, "secondary"),
            ], { "gap": 8 }),
        ]),
    ]);
}

public fn studio_app() {
    return appkit.App("My App", "com.example.myapp", "1.0.0")
        .window_size(1100, 760)
        .window_min_size(640, 480)
        .page("Home", Home)
        .boot(() => state.set("count", int(storage.get("count", 0))));
}
```

---

## 3. OOP, Interfaces & Polymorphic Storage

In Spid3r v1.5.0, class fields and methods default to **`private`** — always add `public` to members accessed outside the class:

```spid3r
import "studio/Store" as store_mod;

fn save_user(store: store_mod.Store, name: string) {
    store.set("user", name);
}
```

---

## 4. Spid3r v1.5.0 Language & AppStudio Best Practices

1. **Explicit `public` on exports & class members:** Unmarked class methods/fields are private (including overrides). Mark exported functions, classes, enums, and public methods with `public`.
2. **Raw strings for JS/CSS/JSON:** Regular `"..."` strings interpolate `{expr}` holes. Always use `r#"..."#` for raw JS, CSS, or JSON strings.
3. **Root-relative imports:** `../` parent-relative imports are disallowed by design. Import from the project root (`import "pages/Home" as home;`) or framework (`import "studio/Components" as ui;` / `import "vendor/studio/Components" as ui;`).
4. **Embedded stdlib modules work everywhere:** `semver`, `uuid`, `tz`, `toml`, `yaml`, `xml`, `decimal`, `bigint`, `stats`, etc. work in native desktop apps and are automatically passed through by `FlatKit` for Web/Android/iOS WASM builds.
5. **Background thread UI updates:** Inside `spawn fn() { ... }`, mutate `State` and call `appkit.request_render()` instead of touching WebView APIs directly from a worker thread.
6. **Named handlers for async WASM callbacks:** Register async HTTP, auth, or native-capability callbacks with `.handler("on_done", on_done)` so callbacks survive across stateless/worker turns.
7. **Stable `"key"` props on dynamic lists:** Pass `{"key": "row-" + string(id)}` so DOM morphing preserves element identity, input focus, and scroll position.
8. **UTF-8 without BOM:** Save `.matrix` / `.mt` files without BOM and format with `spid3r fmt` so `spid3r fmt --check` passes cleanly.

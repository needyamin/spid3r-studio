# Writing `.matrix` Applications in Spid3r v1.1.1

Spid3r is a compiled/VM language using `.matrix` source files. Follow these verified language rules and idioms when building Spid3r Studio apps.

## 1. App Structure (`app.matrix` + `main.matrix` + `studio.json`)

Every project has:
- `studio.json`: App metadata (`name`, `bundleID`, `version`, `entry`, `theme`, `android`, `ios`).
- `app.matrix`: Declarative pages, event handlers, and `public fn studio_app()`.
- `main.matrix`: Thin native entry file containing the 5 required `gui_*` shims (`gui_title`, `gui_set_html`, `gui_eval`, `gui_on`, `gui_emit`).

## 2. Declarative UI & State Example

```spid3r
import "studio/App" as appkit;
import "studio/Components" as ui;
import "studio/State" as state;

fn Home() -> map {
    let count = int(state.get_or("count", 0));
    return ui.page("Counter", [
        ui.card([
            ui.title("Count: " + string(count)),
            ui.row([
                ui.button("Increment", (_ev) => state.set("count", count + 1), "primary"),
                ui.button("Reset", (_ev) => state.set("count", 0), "secondary"),
            ], { "gap": 8 }),
        ]),
    ]);
}

public fn studio_app() {
    return appkit.App("My App", "com.example.myapp", "1.0.0")
        .page("Home", Home);
}
```

## 3. Verified Spid3r v1.1.1 Compatibility Rules

- **Use statement-form `if ... elif ... else`:** Expression-form `let x = if c { a } else { b };` works for two branches, but `elif` inside an expression-form `if` is rejected by the parser (`BUG-06`).
- **Avoid map literals directly inside expression-form `if`:** Assign maps inside statement blocks (`BUG-07`).
- **Raw strings for JS/CSS:** Regular `"..."` strings interpolate `{...}`. Always use `r#"..."#` for raw JSON/JS/CSS snippets.
- **No `../` in `import` paths:** Spid3r resolves imports relative to the entry file or `SPID3R_PATH` (`BUG-08`).
- **Save files as UTF-8 without BOM:** `spid3r fmt --check` rejects files with a UTF-8 BOM. Use the Control Panel's **Save** or **Auto-Recover** button to guarantee BOM-free UTF-8.

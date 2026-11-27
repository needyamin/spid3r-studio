# Contributing to Spid3r Studio (AppStudio)

Thank you for contributing to **Spid3r Studio**! This guide covers environment setup, coding standards, architectural rules, extension recipes, and the verification checklist required before submitting changes.

---

## 1. Prerequisites & Local Setup

1. Install **Spid3r v1.5.0+** (`spid3r` on `PATH`) and **Node.js** (for `client_js.test.mjs`).
2. Verify your environment from the repository root:
   ```powershell
   spid3r run studio.matrix doctor
   ```
3. Run the full verification suite before making changes:
   ```powershell
   Remove-Item Env:SPID3R_PATH -ErrorAction SilentlyContinue
   spid3r run studio.matrix test
   node --test core/tests/client_js.test.mjs
   ```

---

## 2. Project Structure & Placement Rules

Keep the 5-tier A–Z root directory structure intact:

- `frameworks/studio/` — Core UI framework modules (`.matrix`) and `client.js`.
- `frameworks/targets/` — Host shells, WASM worker, Service Worker, Android, iOS, and Desktop templates.
- `frameworks/templates/` — Starter project templates used by `studio new`.
- `downloads/` — Toolchain installers, `xtool`, cached `spid3r.wasm`, and `packages/catalog.json` (large binaries are git-ignored).
- `documents/` — Guides, tutorials, references, SVG diagrams, and HTML handbook.
- `workspace/` — Showcase app (`workspace/demo/`) and developer apps.
- `core/` — CLI subcommands (`core/cli/`), bundler (`core/tools/`), Control Panel (`core/gui/`), `Version.matrix`, `Diagnostics.matrix`, `Recovery.matrix`, `Plugins.matrix`, and automated tests (`core/tests/`).

---

## 3. Coding Conventions (Spid3r v1.5.0)

1. **UTF-8 without BOM + LF line endings:** Never write `.matrix`/`.mt` files with a UTF-8 BOM. Format all modified `.matrix` files with `spid3r fmt`.
2. **Strict `--deny-warnings`:** Every `.matrix` file must pass `spid3r check --deny-warnings` cleanly (no unused variables, unused parameters, unused imports, or unreachable code). Prefix intentionally unused variables with distinct `_` names (e.g., `_ev`, `_unused`).
3. **Explicit visibility:** In Spid3r v1.5.0, class members and top-level declarations default to private. Mark exported APIs, class methods, and public fields with `public`.
4. **Raw strings for embedded code:** Regular `"..."` strings interpolate `{ident}` holes. Always use `r#"..."#` for JS, CSS, HTML, or JSON code blocks.
5. **Root-relative imports:** Parent-relative `../` imports are disallowed. Use root-relative paths (`import "studio/Components" as ui;`, `import "core/Version" as ver_info;`).
6. **Sync `ClientJS.matrix` and `client.js`:** Whenever you edit client runtime JS in `frameworks/studio/ClientJS.matrix`, update `frameworks/studio/client.js` identically (`client_js.test.mjs` enforces byte-for-byte parity).
7. **Single source of version truth:** Reference `core/Version.matrix` (`STUDIO_VERSION`, `SPID3R_TARGET_VERSION`) instead of hardcoding version literals.
8. **Defensive copies & error boundaries:** Return `U.deep_copy(...)` from state/storage getters and handle operational I/O via `Result` (`is_ok()` / `is_err()`) or `try/catch`.

---

## 4. Extension Recipes

### Adding a UI Component
1. Add the constructor function in `frameworks/studio/Components.matrix` returning a node map `{"el": "...", ...}`.
2. Add its HTML renderer in `frameworks/studio/Render.matrix` and register it in the O(1) element dispatch table.
3. Add styles in `frameworks/studio/CSS.matrix` using CSS variables (`--primary`, `--surface`, `--border`, etc.) and logical RTL-friendly properties (`padding-inline`, `inset-inline-*`).
4. Add unit tests in `core/tests/framework.matrix` verifying escaped output and ARIA attributes.

### Adding a CLI Subcommand
1. Implement the handler in an existing or new module under `core/cli/`.
2. Wire the route in `studio.matrix` and update `usage()` in `core/cli/Args.matrix`.
3. Document the command in `documents/references/configuration-reference.md`.

### Adding a Control Panel View
1. Create a page module under `core/gui/pages/` exporting a `public fn <PageName>() -> map`.
2. Register the page in `core/gui/app.matrix` and add its sidebar navigation item in `core/gui/Shell.matrix`.
3. Verify dark/light rendering in `core/tests/gui_center.matrix` and `--dry-run`.

---

## 5. Pre-PR Verification Checklist

Run all checks from the repository root after your final edit:

```powershell
# 1. Canonical format + strict static checks + all 5 .matrix test suites
Remove-Item Env:SPID3R_PATH -ErrorAction SilentlyContinue
spid3r run studio.matrix test

# 2. ClientJS, DOM morph, wasmhost & spid3r.wasm runtime suite
node --test core/tests/client_js.test.mjs

# 3. Headless GUI smoke checks
$env:SPID3R_PATH = '.;frameworks;core;core/cli'
spid3r gui core/gui/main.matrix --html core/gui/host.html --dry-run once
spid3r gui workspace/demo/main.matrix --html frameworks/targets/host.html --dry-run once
Remove-Item Env:SPID3R_PATH -ErrorAction SilentlyContinue

# 4. Multi-target build smoke test (optional local sanity check)
spid3r run studio.matrix build workspace/demo --target web
spid3r run studio.matrix clean workspace/demo
```

Ensure `git status --short` contains no leftover `_test_*`, `._tmp_*`, or `build/` artifacts, and never commit local-only `bugs.html` or `AGENTS.md` if ignored.

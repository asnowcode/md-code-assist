# Markdown Code Assistant

[![VS Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/Faouzi96.md-code-assist)](https://marketplace.visualstudio.com/items?itemName=Faouzi96.md-code-assist) [![VS Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/Faouzi96.md-code-assist)](https://marketplace.visualstudio.com/items?itemName=Faouzi96.md-code-assist) [![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**Language-aware formatting and inline diagnostics for fenced code blocks in Markdown files.**

![Screenshot](https://raw.githubusercontent.com/faouzi96/md-code-assist/main/media/screenshot.png)

Markdown Code Assistant treats the code examples inside your `.md` files as first-class citizens — routing them through the same formatters you use for standalone source files, and surfacing errors directly in the Markdown editor.

---

## Features

- **Format code blocks** — sends each fenced block through Prettier, Black, or shfmt and writes the result back, leaving all surrounding Markdown untouched.
- **Inline diagnostics** — runs syntax and lint checks on code blocks and maps errors back to their exact lines in the Markdown file (Problems panel + gutter icons + inline text).
- **Status bar item** — a `✓ Markdown Code Assist` indicator in the status bar shows when a Markdown file is active, transitions to `⚠ N issues` when diagnostics find problems, and briefly shows `✓ Formatted N blocks` after a format operation.
- **Ignore directive** — add `@md-assistant-ignore` to any fence's info string to exclude that block from formatting and diagnostics entirely (e.g. ` ```js @md-assistant-ignore `).
- **Zero-install shell support** — shell (`sh`) formatting delegates to the [mkhl.shfmt](https://marketplace.visualstudio.com/items?itemName=mkhl.shfmt) extension (auto-installed); ShellCheck diagnostics delegate to [timonwong.shellcheck](https://marketplace.visualstudio.com/items?itemName=timonwong.shellcheck) (auto-installed). No system tools required.
- **Zero-install Python formatting** — delegates to the [ms-python.black-formatter](https://marketplace.visualstudio.com/items?itemName=ms-python.black-formatter) extension (auto-installed). Python itself is not required for formatting.
- **Deep Python diagnostics** — Ruff runs fully in-process via `@astral-sh/ruff-wasm-nodejs` (bundled, no install required). Catches undefined names, unreachable code, style issues, and more. Falls back to `pyflakes` CLI, then `py_compile` if WASM fails.
- **SQL formatting + diagnostics** — `prettier-plugin-sql` is bundled; SQL blocks are formatted in-process and parse errors are surfaced as diagnostics. No external tools required.
- **Format on Save** — optional auto-format whenever you save a Markdown file.
- **Format Document** — `Shift+Alt+F` formats all code blocks via VS Code's built-in shortcut.
- **Graceful degradation** — if a required tool is not available, the extension shows a clear message and skips those blocks without affecting others.

---

## Requirements

| Requirement                                                                                                | Notes                                                                                                       |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| VS Code ≥ 1.85                                                                                             |                                                                                                             |
| Python runtime                                                                                             | Only for Python block **diagnostics** fallback (`pyflakes` / `py_compile`) — not needed when Ruff WASM runs |
| [ms-python.black-formatter](https://marketplace.visualstudio.com/items?itemName=ms-python.black-formatter) | Python **formatting** — auto-installed on activation. Python itself is **not** required.                    |
| [mkhl.shfmt](https://marketplace.visualstudio.com/items?itemName=mkhl.shfmt)                               | Shell (`sh`) **formatting** — auto-installed on activation. No system `shfmt` needed.                       |
| [timonwong.shellcheck](https://marketplace.visualstudio.com/items?itemName=timonwong.shellcheck)           | Shell (`sh`) **diagnostics** — auto-installed on activation. No system `shellcheck` needed.                  |

**Prettier, prettier-plugin-sh, prettier-plugin-sql, js-yaml, postcss, parse5, ESLint, the TypeScript compiler, and `@astral-sh/ruff-wasm-nodejs` are all bundled — no installation required.**

---

## Installation

### VS Code Marketplace

Search for **Markdown Code Assistant** in the Extensions view (`Ctrl+Shift+X`).

### From a `.vsix` file

```bash
code --install-extension md-code-assist-0.1.0.vsix
```

---

## Commands

Open a Markdown file, then use the Command Palette (`Ctrl+Shift+P`):

| Command                                                | Description                                |
| ------------------------------------------------------ | ------------------------------------------ |
| `Markdown Code Assistant: Format All Code Blocks`      | Format every fenced block in the file      |
| `Markdown Code Assistant: Format Current Code Block`   | Format only the block the cursor is inside |
| `Markdown Code Assistant: Show Code Block Diagnostics` | Run diagnostics on all blocks              |
| `Markdown Code Assistant: Diagnose Current Code Block` | Run diagnostics on the block at cursor     |

---

## Supported Languages

### Prettier (bundled)

| Language          | Fence labels          |
| ----------------- | --------------------- |
| JavaScript        | `js`, `javascript`    |
| TypeScript        | `ts`, `typescript`    |
| JSON / JSONC      | `json`, `jsonc`       |
| YAML              | `yaml`, `yml`         |
| HTML              | `html`                |
| CSS / SCSS / Less | `css`, `scss`, `less` |
| GraphQL           | `graphql`, `gql`      |
| Markdown (nested) | `markdown`, `md`      |
| SQL               | `sql`                 |

### VS Code Extensions (auto-installed, no system tools needed)

| Language           | Extension                                                                                                  | Purpose     |
| ------------------ | ---------------------------------------------------------------------------------------------------------- | ----------- |
| Python             | [ms-python.black-formatter](https://marketplace.visualstudio.com/items?itemName=ms-python.black-formatter) | Formatting  |
| Shell (`sh`)       | [mkhl.shfmt](https://marketplace.visualstudio.com/items?itemName=mkhl.shfmt)                               | Formatting  |
| Shell (`sh`)       | [timonwong.shellcheck](https://marketplace.visualstudio.com/items?itemName=timonwong.shellcheck)           | Diagnostics |

### CLI fallbacks (optional)

If the VS Code extensions above are unavailable, the extension falls back to the system CLI tools if installed:

| Language           | Tool       | Purpose                       | Install                   |
| ------------------ | ---------- | ----------------------------- | ------------------------- |
| Python             | pyflakes   | Diagnostics (undefined names) | `pip install pyflakes`    |
| Python             | Black      | Formatting                    | `pip install black`       |
| Shell (`sh`)       | shfmt      | Formatting                    | `brew install shfmt`      |
| Shell (`sh`)       | shellcheck | Diagnostics                   | `brew install shellcheck` |

---

## Configuration

All settings are under `mdCodeAssist.*` and can be set at User, Workspace, or Folder scope.

| Setting                        | Default                                                                                              | Description                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `format.enabledLanguages`      | `["javascript","typescript","python","json","yaml","html","css","shell","graphql","markdown","sql"]` | Languages to format                               |
| `format.triggerMode`           | `"onCommand"`                                                                                        | When to format: `onCommand`, `onSave`, `onType`   |
| `diagnostics.enabledLanguages` | `["javascript","typescript","python","json","yaml","css","html","shell","sql"]`                      | Languages to diagnose                             |
| `diagnostics.triggerMode`      | `"onCommand"`                                                                                        | When to diagnose: `onCommand`, `onSave`, `onType` |
| `formatters.blackPath`         | `"black"`                                                                                            | Path to Black CLI executable (fallback)           |
| `formatters.shfmtPath`         | `"shfmt"`                                                                                            | Path to shfmt CLI executable (fallback)           |
| `decorations.showGutterIcons`  | `true`                                                                                               | Colored gutter icons for diagnostics              |
| `decorations.showInlineErrors` | `true`                                                                                               | Inline error text after affected lines            |

### Trigger modes

| Mode          | Behavior                                                                              |
| ------------- | ------------------------------------------------------------------------------------- |
| `"onCommand"` | **Default.** Nothing runs automatically — you call the command when you want results. |
| `"onSave"`    | Runs every time you save the Markdown file.                                           |
| `"onType"`    | Watch mode — runs continuously as you edit (debounced 500 ms).                        |

With `onSave`, formatting edits join a Markdown text document's save before it is written to disk. Documents with no enabled, supported code blocks (including prose and `text` fences) are skipped without a notification or edit. MEO Enhanced 0.3.33 rejects a save if another extension changes its requested text, so Markdown Code Assistant skips automatic formatting only when MEO is the active editor. Saving from the standard text editor still formats code blocks, even if the same file is also open in MEO.

> **Tip:** Prefix any fence with `@md-assistant-ignore` to permanently exclude a block from all processing: ` ```python @md-assistant-ignore `

Example — format and diagnose on save:

```jsonc
{
  // Format and diagnose every time the file is saved
  "mdCodeAssist.format.triggerMode": "onSave",
  "mdCodeAssist.diagnostics.triggerMode": "onSave"
}
```

Example — watch mode (format and diagnose as you type):

```jsonc
{
  "mdCodeAssist.format.triggerMode": "onType",
  "mdCodeAssist.diagnostics.triggerMode": "onType"
}
```

Example — full custom setup:

```jsonc
{
  "mdCodeAssist.format.enabledLanguages": [
    "javascript",
    "typescript",
    "python",
    "json",
    "yaml",
    "html",
    "css",
    "shell",
    "graphql",
    "sql"
  ],
  "mdCodeAssist.diagnostics.enabledLanguages": [
    "javascript",
    "typescript",
    "json",
    "yaml",
    "css",
    "html",
    "shell",
    "python",
    "sql"
  ],
  "mdCodeAssist.format.triggerMode": "onSave",
  "mdCodeAssist.diagnostics.triggerMode": "onSave"
}
```

---

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — pipeline diagrams, module layout, design decisions
- [Contributing](docs/CONTRIBUTING.md) — dev setup, code style, adding formatters, test guidelines

---

## License

[MIT](LICENSE)

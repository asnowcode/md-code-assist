# Changelog

All notable changes to Markdown Code Assistant will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- **TypeScript diagnostics via bundled TS compiler API** — `typescriptDiagnostics.ts` uses `ts.createSourceFile` + `program.getSyntacticDiagnostics` from the TypeScript compiler (bundled into `extension.js`). Syntax-only — no type resolution — so missing-import false positives are avoided entirely in documentation snippets.
- **SQL blocks enabled by default** — `sql` added to both `format.enabledLanguages` and `diagnostics.enabledLanguages` defaults; no manual configuration required.

### Changed

- **JS diagnostics now use bundled ESLint** — `eslintExtensionDiagnostics.ts` no longer delegates to the `dbaeumer.vscode-eslint` extension. ESLint is fully bundled into `extension.js` via esbuild; `espree`/`acorn`/`acorn-jsx`/`eslint-visitor-keys` are shipped on disk inside the VSIX because `espree` calls `require.resolve()` at module load time.

### Removed

- **Dockerfile support dropped** — `DockerExtensionFormatter`, `dockerExtensionDiagnostics.ts`, and the `docker`/`dockerfile` language alias have been removed. Extension delegation to `ms-azuretools.vscode-docker` was too fragile. Dockerfile blocks are silently skipped; support may return in a future release.

### Fixed

- **Save persistence** — apply `onSave` code-block formatting before the disk write in standard Markdown editors. Skip automatic formatting in MEO Enhanced 0.3.33 so its save succeeds without a conflicting revision.

- **Format on save with custom Markdown editors** — format the saved document rather than the active editor, and silently skip documents without eligible code blocks.

- **esbuild packaging**: `eslint` removed from `devDependencies` (vsce silently excludes devDeps even when `.vscodeignore` negation rules are present); it is now in `dependencies` and bundled at build time.
- **Tab close behaviour** in `BlackExtensionFormatter` and `ShfmtExtensionFormatter`: replaced `closeActiveEditor` with targeted `tabGroups.close()` so the user's active editor is never disturbed by background formatting operations.

---

### Added (previous unreleased)

#### Formatting

- **Shell/Bash formatting via extension delegate** — introduced `ShfmtExtensionFormatter` which delegates to the [`mkhl.shfmt`](https://marketplace.visualstudio.com/items?itemName=mkhl.shfmt) VS Code extension via `vscode.executeFormatDocumentProvider`. The extension is automatically prompted for installation on first activation if not already present. Falls back to the `shfmt` CLI if the extension is unavailable.
- **Shell/Bash/Zsh formatting** (bundled fallback, no install required) via [`prettier-plugin-sh`](https://github.com/un-ts/prettier/tree/master/packages/sh), replacing the deprecated `mvdan-sh` package. Shell blocks (`sh`, `bash`, `zsh`, `shell`) are formatted by the Prettier pipeline with zero external dependencies.
- **Python formatting via extension delegate** — introduced `BlackExtensionFormatter` which delegates to the [`ms-python.black-formatter`](https://marketplace.visualstudio.com/items?itemName=ms-python.black-formatter) VS Code extension via `vscode.executeFormatDocumentProvider`. The extension is automatically prompted for installation on first activation if not already present.
- **`ensureShfmtExtension()`** utility that silently installs `mkhl.shfmt` in the background on extension activation.
- **`ensureBlackExtension()`** utility that silently installs `ms-python.black-formatter` in the background on extension activation.

#### Diagnostics

- **Shell diagnostics via extension delegate** — introduced `ShellCheckExtensionDiagnostics` which delegates to the [`timonwong.shellcheck`](https://marketplace.visualstudio.com/items?itemName=timonwong.shellcheck) VS Code extension. No system `shellcheck` install required. SC2148 (missing shebang) is suppressed as a false positive for inline snippets.
- **`ensureShellCheckExtension()`** utility that silently installs `timonwong.shellcheck` in the background on extension activation.
- **Shell diagnostic priority chain**: ShellCheck extension → `shellcheck` CLI → `prettier-plugin-sh` parse errors (bundled fallback).
- **YAML diagnostics** (bundled) — syntax errors reported with line/column via `js-yaml`'s `YAMLException`.
- **CSS diagnostics** (bundled) — syntax errors reported with line/column via `postcss` `CssSyntaxError`.
- **HTML diagnostics** (bundled) — structural parse errors reported via `parse5`'s `onParseError` callback.
- **Shell fallback diagnostics** (bundled) — when `shellcheck` is not installed, `prettier-plugin-sh`'s parse errors are used to surface basic shell syntax issues without any external tool.
- Expanded default `mdCodeAssist.diagnostics.enabledLanguages` to include `python`, `json`, `yaml`, `css`, `html`, and `shell` in addition to `javascript` and `typescript` — all supported languages are now enabled out of the box.
- Expanded default `mdCodeAssist.format.enabledLanguages` to include `html`, `css`, `graphql`, and `markdown` — all supported languages are now enabled out of the box.

### Fixed

- `BlackFormatter` and `ShfmtFormatter` now correctly honour the `executablePath` field from `FormatOptions`, allowing per-call path overrides in addition to the workspace setting.

### Removed

- `mvdan-sh` dependency — removed in favour of `prettier-plugin-sh`.

---

## [0.1.0] — 2026-05-09

### Added

#### Formatting

- **Format All Code Blocks** command (`mdCodeAssist.formatAllBlocks`) — formats every fenced code block in the active Markdown file in parallel.
- **Format Current Code Block** command (`mdCodeAssist.formatCurrentBlock`) — formats only the block the cursor is inside.
- **`DocumentFormattingEditProvider`** registration — the standard `Format Document` shortcut (`Shift+Alt+F`) now formats all code blocks.
- **Format on Save** — optional `mdCodeAssist.formatOnSave` setting to auto-format on every Markdown save.
- **Prettier integration** (bundled, no install required) for JavaScript, TypeScript, JSON, JSONC, YAML, HTML, CSS, SCSS, Less, GraphQL, and Markdown.
- **Black integration** (external CLI) for Python code blocks, invoked via stdin (`black - --quiet`).
- **shfmt integration** (external CLI) for Shell/Bash/Zsh code blocks, invoked via stdin (`shfmt -`).
- **Tool detection** with session-level caching — graceful informational message when Black or shfmt are not installed.
- **Language aliases** — fence labels such as `js`, `ts`, `py`, `bash`, `yml`, `gql` are automatically resolved to their canonical formatter language.

#### Diagnostics

- **Inline diagnostics** for code blocks using VS Code language services — errors and warnings appear as squiggly underlines and in the Problems panel.
- **Virtual document provider** — code blocks are projected into in-memory documents at `md-code-assist://block/<hash>` so the active language server (TypeScript, Pylance, etc.) can analyze them.
- **Diagnostic mapper** — converts virtual document positions back to their exact line/character in the originating Markdown file.
- **Show Code Block Diagnostics** command (`mdCodeAssist.showDiagnostics`) — triggers a manual diagnostic refresh.
- **Debounced refresh** (500 ms) on every document change to avoid hammering language services on every keypress.
- `mdCodeAssist.diagnostics.enabledLanguages` setting to control which languages receive diagnostics.
- `mdCodeAssist.diagnostics.severityLevel` setting to filter out diagnostics below a threshold.

#### Decorations

- **Gutter icons** — colored SVG circle indicators for Error, Warning, Information, and Hint severity levels.
- **Inline error text** — italic after-line annotations surfacing the diagnostic message without leaving the Markdown file, truncated at 120 characters.
- `mdCodeAssist.decorations.showGutterIcons` and `mdCodeAssist.decorations.showInlineErrors` settings to toggle each decoration type independently.

#### Infrastructure

- TypeScript strict-mode codebase with esbuild bundling.
- Jest + ts-jest test suite with manual VS Code API mock.
- GitHub Actions CI matrix across Ubuntu, macOS, and Windows.
- Automatic `.vsix` artifact upload on push to `main`; marketplace publish on version tags (`v*`).
- `Markdown Code Assistant` output channel for structured diagnostic and error logging.

[Unreleased]: https://github.com/md-code-assist/md-code-assist/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/md-code-assist/md-code-assist/releases/tag/v0.1.0

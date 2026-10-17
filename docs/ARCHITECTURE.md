# Architecture

## Formatting pipeline

The `onWillSaveTextDocument` listener formats the document being saved and returns only changed code-block `TextEdit`s through `waitUntil`, so they are written in the same save transaction. The `onDidSaveTextDocument` listener handles save-triggered diagnostics; manual format commands use the active text editor and `WorkspaceEdit`. The shared document formatter skips disabled languages and fences without a registered formatter before showing progress. Custom editors are supported when they expose standard text-document save events.

```
Markdown file
    │
    ▼
┌─────────────────────┐
│  Markdown Parser    │  unified + remark-parse → mdast Root
└──────────┬──────────┘
           │ visit("code") nodes
           ▼
┌─────────────────────┐
│  Code Block         │  Extract fenced blocks with 0-based
│  Extractor          │  start/end lines, content lines, language
└──────────┬──────────┘
           │ one block per formatter call
           ▼
┌─────────────────────┐
│  Formatter          │  Language → formatter lookup via registry
│  Dispatcher         │  Checks enabled languages, tool availability
└──────┬──────┬───────┘
       │      │
       ▼      ▼
  Prettier          Black CLI    shfmt CLI   BlackExtension  ShfmtExtension
  (Node API +       (stdin)      (stdin)     (ms-python.     (mkhl.shfmt
   plugin-sh WASM)                            black-formatter) extension
                                              extension        delegate)
       │                │            │              │               │
       └────────────────┴────────────┴──────────────┴───────────────┘
           │ formatted code string
           ▼
┌─────────────────────┐
│  TextEdit           │  Replace only the content lines (not fences)
│  Application        │  via VS Code WorkspaceEdit / TextEdit[]
└─────────────────────┘
```

## Diagnostics pipeline

```
Markdown file (on change, debounced 500 ms)
    │
    ▼
┌──────────────────────────────┐
│  Code Block Extractor        │  same parser as above
└──────────────┬───────────────┘
               │ filter by diagnostics.enabledLanguages
               ▼
┌──────────────────────────────┐
│  CLI Diagnostics             │  ESLint/espree (JS — includes `no-undef` for undeclared names)
│                              │  TypeScript compiler API (TS — semantic diagnostics with DOM+ES2022 libs, filtered false positives)
│                              │  Ruff WASM (in-process) → pyflakes CLI → python -m py_compile (Python)
│                              │  ShellCheck extension → shellcheck CLI → prettier-plugin-sh (Shell)
│                              │  JSON.parse (JSON)
│                              │  js-yaml (YAML, bundled)
│                              │  PostCSS (CSS, bundled)
│                              │  parse5 (HTML, bundled)
│                              │  node-sql-parser (SQL, bundled)
└──────────────┬───────────────┘
               │ block-relative Diagnostic[]
               ▼
┌──────────────────────────────┐
│  Diagnostic Mapper           │  relative position + contentStartLine
│                              │  → absolute Markdown position
└──────────────┬───────────────┘
               │
       ┌───────┴────────┐
       ▼                ▼
DiagnosticCollection  DecorationManager  StatusBarController
(Problems panel)      (gutter + inline)  (status bar item)
```

## Module layout

```
src/
├── extension.ts              # activate() / deactivate() — wires everything together
│
├── ui/
│   └── statusBarItem.ts      # StatusBarController — idle/issue-count/post-format states
│
├── parser/
│   ├── markdownParser.ts     # unified + remark-parse → Root AST
│   ├── codeBlockExtractor.ts # visit("code") → CodeBlock[]
│   ├── types.ts              # CodeBlock interface
│   └── index.ts              # Barrel export
│
├── formatters/
│   ├── types.ts              # IFormatter, FormatOptions, FormatResult
│   ├── formatterRegistry.ts  # Language-to-formatter map + LANGUAGE_ALIASES
│   ├── prettierFormatter.ts        # Prettier Node API + prettier-plugin-sh (shell) + prettier-plugin-sql (SQL)
│   ├── blackFormatter.ts          # Black CLI via stdin
│   ├── shfmtFormatter.ts          # shfmt CLI via stdin (fallback)
│   ├── blackExtensionFormatter.ts # Python via ms-python.black-formatter extension
│   ├── shfmtExtensionFormatter.ts # Shell via mkhl.shfmt extension
│   ├── formatterDispatcher.ts# Routes a CodeBlock to the right formatter
│   └── index.ts
│
├── commands/
│   ├── formatAllBlocks.ts    # Format all blocks; also the FormattingEditProvider impl
│   ├── formatCurrentBlock.ts # Format block at cursor
│   └── commandRegistry.ts    # registerCommands(context, provider)
│
├── diagnostics/
│   ├── types.ts              # MappedDiagnostic, VirtualDocument
│   ├── cliDiagnostics.ts     # Per-language check runners
│   ├── eslintExtensionDiagnostics.ts # JS diagnostics via bundled ESLint/espree
│   ├── typescriptDiagnostics.ts      # TS diagnostics via bundled TypeScript compiler API (semantic, filtered)
│   ├── shellCheckExtensionDiagnostics.ts # Shell diagnostics via timonwong.shellcheck extension (temp file + debounce)
│   ├── ruffWasmDiagnostics.ts        # Python diagnostics via @astral-sh/ruff-wasm-nodejs (in-process, bundled)
│   ├── diagnosticMapper.ts   # Map relative → absolute positions
│   ├── diagnosticProvider.ts # Orchestrates refresh / refreshBlock
│   └── index.ts
│
├── decorations/
│   ├── decorationManager.ts  # Creates + applies gutter and inline types
│   ├── gutterDecorations.ts  # SVG circle data-URI gutter icons
│   └── inlineDecorations.ts  # After-line italic error text
│
├── config/
│   ├── defaults.ts           # Shared constants (timeouts, scheme name, …)
│   ├── settings.ts           # getSettings() — reads mdCodeAssist.* config
│   └── formatterPaths.ts     # getBlackPath(), getShfmtPath()
│
└── utils/
    ├── cliRunner.ts          # spawn() wrapper — shell:false, stdin pipe, timeout
    ├── toolDetector.ts       # isToolAvailable() with session-level cache
    ├── positionMapping.ts    # Offset ↔ line/char conversions
    └── logger.ts             # "Markdown Code Assistant" output channel
```

## Key design decisions

| Decision                                                                            | Rationale                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@md-assistant-ignore` meta tag in fence info string skips block entirely           | Users occasionally need a block that must not be formatted (e.g. intentionally broken code for documentation); checking the remark `Code.meta` field costs nothing and avoids false negatives                                                                                                                  |
| `jsx`/`tsx` fence labels not aliased to `javascript`/`typescript`                   | JSX/TSX syntax is not valid in plain JS/TS contexts; running Prettier or ESLint on JSX inside a bare `.ts` context produces false errors. Blocks are silently skipped.                                                                                                                                         |
| `shell: false` in all `spawn()` calls                                               | Prevents shell injection from formatter paths or code content                                                                                                                                                                                                                                                  |
| `prettier` marked external in esbuild, shipped in VSIX `node_modules/`              | Prettier 3 uses `import.meta.url` in its ESM plugins; bundling it to CJS causes `fileURLToPath(undefined)` at startup                                                                                                                                                                                          |
| TypeScript bundled into `extension.js` via esbuild                                  | The TS compiler API is used for semantic diagnostics with DOM+ES2022 lib files served from the bundled TypeScript package; bundling avoids shipping ~50 transitive deps on disk while keeping the full type checker available in-process                                                                       |
| TS semantic diagnostics with suppressed isolation codes                             | `getSemanticDiagnostics()` is used instead of `getSyntacticDiagnostics()` so undeclared local names (e.g. typos) are caught; codes 2307/2580/2591/etc. are suppressed because they fire only due to missing imports/ambient context in isolated snippets                                                       |
| `no-undef` ESLint rule enabled for JS snippets                                      | Safe because `env: { browser, node, es2022 }` already covers all standard globals; only truly undeclared local names (typos, missing declarations) fire                                                                                                                                                        |
| `ruffWasmDiagnostics` uses `@astral-sh/ruff-wasm-nodejs`                            | Ruff WASM runs fully in-process — no extension delegation or system install needed. `F401`/`E401` are suppressed as false positives in snippets. Marked as esbuild external and whitelisted in `.vscodeignore` so the WASM file path resolves correctly.                                                       |
| `ShellCheckExtensionDiagnostics` uses a temp file + debounce                        | ShellCheck extension activates lazily, so `isActive` is always `false` from Markdown context. A temp `.sh`/`.bash` file is written (with CRLF normalised), the extension is activated explicitly, and diagnostics are collected via a 400 ms debounced `onDidChangeDiagnostics` listener with an 8 s hard cap. |
| ESLint bundled into `extension.js`; `espree` shipped as an external                 | `espree` uses `require.resolve()` at load time, which requires a real file on disk; all other ESLint internals bundle cleanly to CJS                                                                                                                                                                           |
| Language aliases duplicated in `parser/` and `formatters/`                          | Avoids a circular import between the two layers                                                                                                                                                                                                                                                                |
| 0-based positions internally                                                        | Matches VS Code API; remark's 1-based positions are converted on extraction                                                                                                                                                                                                                                    |
| Debounced diagnostic refresh (500 ms)                                               | Avoids re-running checks on every keypress                                                                                                                                                                                                                                                                     |
| CLI-based diagnostics (not virtual documents + LSP)                                 | Virtual documents on a custom URI scheme cannot receive language-server diagnostics; VS Code only provides them for real files                                                                                                                                                                                 |
| `FormatSummary` returned from `formatDocument`                                      | Allows the command to show specific feedback (already formatted / skipped / formatted N) instead of a generic "nothing to format"                                                                                                                                                                              |
| `prettier-plugin-sh` (WASM) instead of `mvdan-sh`                                   | `mvdan-sh` is deprecated; `prettier-plugin-sh` is the maintained replacement and integrates directly with the Prettier pipeline                                                                                                                                                                                |
| `ShfmtExtensionFormatter` delegates to `mkhl.shfmt`                                 | Avoids requiring a system `shfmt` install; the extension bundles the binary and integrates with VS Code's formatter pipeline                                                                                                                                                                                   |
| `BlackExtensionFormatter` delegates to `ms-python.black-formatter`                  | Avoids bundling a Python runtime; the extension is auto-installed and provides a proper VS Code `TextEdit[]` response                                                                                                                                                                                          |
| In-process YAML/CSS/HTML/SQL diagnostics via js-yaml/PostCSS/parse5/node-sql-parser | These parsers throw structured errors with line/column; no external CLI needed for baseline syntax checking                                                                                                                                                                                                    |

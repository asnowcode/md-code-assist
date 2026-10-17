import * as vscode from 'vscode';
import { registerCommands } from './commands/commandRegistry';
import { formatDocument } from './commands/formatAllBlocks';
import { DiagnosticProvider } from './diagnostics/diagnosticProvider';
import { DecorationManager } from './decorations/decorationManager';
import { Logger } from './utils/logger';
import { getSettings } from './config/settings';
import { formatterRegistry } from './formatters/formatterRegistry';
import { PrettierFormatter } from './formatters/prettierFormatter';
import { BlackFormatter } from './formatters/blackFormatter';
import {
  BlackExtensionFormatter,
  ensureBlackExtension,
} from './formatters/blackExtensionFormatter';
import { ShfmtFormatter } from './formatters/shfmtFormatter';
import {
  ShfmtExtensionFormatter,
  ensureShfmtExtension,
} from './formatters/shfmtExtensionFormatter';
import { ensureShellCheckExtension } from './diagnostics/shellCheckExtensionDiagnostics';
import { StatusBarController } from './ui/statusBarItem';

let diagnosticProvider: DiagnosticProvider | undefined;
let decorationManager: DecorationManager | undefined;
let statusBar: StatusBarController | undefined;

export function activate(context: vscode.ExtensionContext): void {
  Logger.initialize(context);
  Logger.info('Markdown Code Assistant activated.');

  // Register formatters.
  // Registration order matters: last registered wins for overlapping languages.
  // Priority (highest last):
  //   1. BlackFormatter CLI (fallback if extension unavailable)
  //   2. BlackExtensionFormatter (delegates to ms-python.black-formatter)
  //   3. PrettierFormatter (wins for shell + all Prettier languages)
  const settings = getSettings();
  formatterRegistry.register(new BlackFormatter(settings.formatters.blackPath));
  formatterRegistry.register(new ShfmtFormatter(settings.formatters.shfmtPath));
  formatterRegistry.register(new BlackExtensionFormatter());
  formatterRegistry.register(new ShfmtExtensionFormatter()); // wins over ShfmtFormatter CLI
  formatterRegistry.register(new PrettierFormatter());

  // Auto-install the Black Formatter extension in the background if absent.
  // This makes Python formatting work out of the box for users with Python installed.
  void ensureBlackExtension().then((installed) => {
    if (!installed) {
      Logger.info(
        'Python formatting requires either the ms-python.black-formatter extension or black CLI.',
      );
    }
  });

  void ensureShfmtExtension().then((installed) => {
    if (!installed) {
      Logger.info('Shell formatting requires either the mkhl.shfmt extension or shfmt CLI.');
    }
  });

  void ensureShellCheckExtension().then((installed) => {
    if (!installed) {
      Logger.info('Shell diagnostics require the timonwong.shellcheck extension.');
    }
  });

  decorationManager = new DecorationManager();
  statusBar = new StatusBarController();
  diagnosticProvider = new DiagnosticProvider(decorationManager, statusBar);

  // Show status bar only when a Markdown editor is active
  if (vscode.window.activeTextEditor?.document.languageId === 'markdown') {
    statusBar.show();
  }
  const onEditorChangeListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor?.document.languageId === 'markdown') {
      statusBar?.show();
    } else {
      statusBar?.hide();
    }
  });

  registerCommands(context, diagnosticProvider, statusBar);

  // DocumentFormattingEditProvider — delegates to formatAllBlocks
  const formattingProvider = vscode.languages.registerDocumentFormattingEditProvider(
    { language: 'markdown' },
    {
      async provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        _options: vscode.FormattingOptions,
        token: vscode.CancellationToken,
      ): Promise<vscode.TextEdit[]> {
        const summary = await formatDocument(document, token);
        return summary.edits;
      },
    },
  );

  // Debounced on-change listener — fires only when watch mode (onType) is active
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  const onChangeListener = vscode.workspace.onDidChangeTextDocument((e) => {
    if (e.document.languageId !== 'markdown') {
      return;
    }
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      const config = vscode.workspace.getConfiguration('mdCodeAssist');
      if (config.get<string>('diagnostics.triggerMode') === 'onType') {
        void diagnosticProvider?.refresh(e.document);
      }
      if (config.get<string>('format.triggerMode') === 'onType') {
        void vscode.commands.executeCommand('mdCodeAssist.formatAllBlocks');
      }
    }, 500);
  });

  // Save-time edits must be returned before VS Code writes the document.
  const onWillSaveListener = vscode.workspace.onWillSaveTextDocument((event) => {
    if (event.document.languageId !== 'markdown') {
      return;
    }
    const config = vscode.workspace.getConfiguration('mdCodeAssist');
    if (config.get<string>('format.triggerMode') !== 'onSave') {
      return;
    }
    // MEO 0.3.33 rejects saves when another extension changes the requested revision.
    const activeTabInput = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    const isMeoDocument = activeTabInput instanceof vscode.TabInputCustom
      && activeTabInput.viewType === 'meoEnhanced.editor'
      && activeTabInput.uri.toString() === event.document.uri.toString();
    if (isMeoDocument) {
      return;
    }
    event.waitUntil(
      (async () => {
        const tokenSource = new vscode.CancellationTokenSource();
        const version = event.document.version;
        try {
          const summary = await formatDocument(event.document, tokenSource.token);
          if (event.document.version !== version) {
            return [];
          }
          if (summary.failedCount > 0) {
            void vscode.window.showWarningMessage(
              `Markdown Code Assistant: ${summary.failedCount} code block(s) could not be formatted. Check the Output panel for details.`,
            );
          }
          return summary.edits;
        } catch (error) {
          Logger.error('Could not format code blocks before saving.', error);
          void vscode.window.showWarningMessage(
            'Markdown Code Assistant: Code blocks could not be formatted. The document will still be saved.',
          );
          return [];
        } finally {
          tokenSource.dispose();
        }
      })(),
    );
  });

  // Diagnostics run after the document has been saved.
  const onSaveListener = vscode.workspace.onDidSaveTextDocument((document) => {
    if (document.languageId !== 'markdown') {
      return;
    }
    const config = vscode.workspace.getConfiguration('mdCodeAssist');
    if (config.get<string>('diagnostics.triggerMode') === 'onSave') {
      void diagnosticProvider?.refresh(document);
    }
  });

  // Clean up diagnostics when a Markdown file is closed
  const onCloseListener = vscode.workspace.onDidCloseTextDocument((document) => {
    if (document.languageId === 'markdown') {
      diagnosticProvider?.clearDocument(document.uri);
    }
  });

  context.subscriptions.push(
    formattingProvider,
    onChangeListener,
    onWillSaveListener,
    onSaveListener,
    onCloseListener,
    onEditorChangeListener,
    decorationManager,
    statusBar,
  );
}

export function deactivate(): void {
  diagnosticProvider?.dispose();
  Logger.info('Markdown Code Assistant deactivated.');
}

import * as vscode from 'vscode';
import { activate } from '../../../src/extension';
import { DiagnosticProvider } from '../../../src/diagnostics/diagnosticProvider';
import { formatterRegistry } from '../../../src/formatters/formatterRegistry';

jest.mock('../../../src/diagnostics/diagnosticProvider', () => ({
  DiagnosticProvider: jest.fn().mockImplementation(() => ({
    refresh: jest.fn(),
    clearDocument: jest.fn(),
    dispose: jest.fn(),
  })),
}));
jest.mock('../../../src/decorations/decorationManager', () => ({
  DecorationManager: jest.fn().mockImplementation(() => ({ dispose: jest.fn() })),
}));
jest.mock('../../../src/formatters/blackExtensionFormatter', () => ({
  ...jest.requireActual('../../../src/formatters/blackExtensionFormatter'),
  ensureBlackExtension: jest.fn(async () => true),
}));
jest.mock('../../../src/formatters/shfmtExtensionFormatter', () => ({
  ...jest.requireActual('../../../src/formatters/shfmtExtensionFormatter'),
  ensureShfmtExtension: jest.fn(async () => true),
}));
jest.mock('../../../src/diagnostics/shellCheckExtensionDiagnostics', () => ({
  ...jest.requireActual('../../../src/diagnostics/shellCheckExtensionDiagnostics'),
  ensureShellCheckExtension: jest.fn(async () => true),
}));

let save: (document: vscode.TextDocument) => void;
let subscriptions: vscode.Disposable[];
const COMMANDS = new Map<string, (...args: unknown[]) => unknown>();

function document(text: string, name = 'saved.md', languageId = 'markdown'): vscode.TextDocument {
  return {
    languageId,
    fileName: name,
    uri: vscode.Uri.file(name),
    getText: () => text,
    lineAt: (line: number) => ({ text: text.split('\n')[line] }),
  } as vscode.TextDocument;
}

beforeEach(() => {
  subscriptions = [];
  COMMANDS.clear();
  jest.mocked(vscode.commands.registerCommand).mockImplementation((id, callback) => {
    COMMANDS.set(id, callback);
    return { dispose: jest.fn() };
  });
  jest.mocked(vscode.commands.executeCommand).mockImplementation(async (id: string) => {
    COMMANDS.get(id)?.();
    return undefined as never;
  });
  jest.mocked(vscode.workspace.getConfiguration).mockReturnValue({
    get: (key: string) =>
      key === 'format.triggerMode'
        ? 'onSave'
        : key === 'diagnostics.triggerMode'
          ? 'onCommand'
          : undefined,
  } as vscode.WorkspaceConfiguration);
  jest.mocked(vscode.workspace.onDidSaveTextDocument).mockImplementation((listener) => {
    save = listener;
    return { dispose: jest.fn() };
  });
  Object.defineProperty(vscode.window, 'activeTextEditor', {
    value: undefined,
    configurable: true,
  });
  activate({ subscriptions } as unknown as vscode.ExtensionContext);
  formatterRegistry.register({
    supportedLanguages: ['javascript'],
    isAvailable: async () => true,
    format: async () => ({ success: true, formatted: 'const answer = 42;' }),
  });
});

afterEach(() => {
  subscriptions.forEach((subscription) => subscription.dispose());
});

it('silently skips a saved Markdown document containing only a text block', async () => {
  save(document('# Notes\n\n```text\nplain text\n```\n'));
  await new Promise(setImmediate);

  expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
  expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
});

it('silently skips an unlabelled code block', async () => {
  save(document('```\nplain text\n```'));
  await new Promise(setImmediate);

  expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
  expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
});

it('formats the saved document even without an active text editor', async () => {
  const saved = document('# Notes\n\n```js\nconst answer=42\n```\n');
  save(saved);
  await new Promise(setImmediate);

  const edit = jest.mocked(vscode.WorkspaceEdit).mock.results[0].value;
  expect(edit.set).toHaveBeenCalledWith(saved.uri, [
    expect.objectContaining({ newText: 'const answer = 42;' }),
  ]);
  expect(vscode.workspace.applyEdit).toHaveBeenCalledWith(edit);
  expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
});

it('edits the saved document rather than another active document', async () => {
  Object.defineProperty(vscode.window, 'activeTextEditor', {
    value: { document: document('```js\nconst answer=0\n```', 'other.md') },
    configurable: true,
  });
  const saved = document('```js\nconst answer=42\n```', 'saved.md');
  save(saved);
  await new Promise(setImmediate);

  const edit = jest.mocked(vscode.WorkspaceEdit).mock.results[0].value;
  expect(edit.set).toHaveBeenCalledWith(saved.uri, [
    expect.objectContaining({ newText: 'const answer = 42;' }),
  ]);
});

it('does not write or notify when eligible code is already formatted', async () => {
  save(document('```js\nconst answer = 42;\n```'));
  await new Promise(setImmediate);

  expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
  expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
  expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
});

it('reports a formatter failure instead of silently treating it as no work', async () => {
  formatterRegistry.register({
    supportedLanguages: ['javascript'],
    isAvailable: async () => true,
    format: async () => ({ success: false, error: 'Invalid JavaScript' }),
  });
  save(document('```js\nconst =\n```'));
  await new Promise(setImmediate);

  expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
  expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
    expect.stringContaining('1 code block(s) could not be formatted'),
  );
});

it('reports a failed block when another block is already formatted', async () => {
  formatterRegistry.register({
    supportedLanguages: ['javascript'],
    isAvailable: async () => true,
    format: async (code) =>
      code.includes('invalid')
        ? { success: false, error: 'Invalid JavaScript' }
        : { success: true, formatted: code },
  });
  save(document('```js\nconst answer = 42;\n```\n\n```js\ninvalid\n```'));
  await new Promise(setImmediate);

  expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
  expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
    expect.stringContaining('1 code block(s) could not be formatted'),
  );
  expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
});

it('reports a failed block even when another block was formatted', async () => {
  formatterRegistry.register({
    supportedLanguages: ['javascript'],
    isAvailable: async () => true,
    format: async (code) =>
      code.includes('invalid')
        ? { success: false, error: 'Invalid JavaScript' }
        : { success: true, formatted: 'const answer = 42;' },
  });
  save(document('```js\nconst answer=42\n```\n\n```js\ninvalid\n```'));
  await new Promise(setImmediate);

  expect(vscode.workspace.applyEdit).toHaveBeenCalled();
  expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
    expect.stringContaining('1 code block(s) could not be formatted'),
  );
});

it('formats only eligible blocks in a mixed Markdown document', async () => {
  save(
    document(
      '# Notes\n\n```text\nplain\n```\n\n```js\nconst answer=42\n```\n\n```js @md-assistant-ignore\nconst ignored=1\n```',
    ),
  );
  await new Promise(setImmediate);

  const edit = jest.mocked(vscode.WorkspaceEdit).mock.results[0].value;
  expect(edit.set).toHaveBeenCalledWith(expect.anything(), [
    expect.objectContaining({
      newText: 'const answer = 42;',
      range: expect.objectContaining({ start: { line: 7, character: 0 } }),
    }),
  ]);
  expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
});

it('skips a language disabled by settings', async () => {
  jest.mocked(vscode.workspace.getConfiguration).mockReturnValue({
    get: (key: string) =>
      key === 'format.triggerMode'
        ? 'onSave'
        : key === 'format.enabledLanguages'
          ? []
          : 'onCommand',
  } as unknown as vscode.WorkspaceConfiguration);
  save(document('```js\nconst answer=42\n```'));
  await new Promise(setImmediate);

  expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
  expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
});

it('does not apply edits calculated for an older document version', async () => {
  let finishFormat!: (value: { success: boolean; formatted: string }) => void;
  formatterRegistry.register({
    supportedLanguages: ['javascript'],
    isAvailable: async () => true,
    format: () =>
      new Promise((resolve) => {
        finishFormat = resolve;
      }),
  });
  const saved = { ...document('```js\nconst answer=42\n```'), version: 1 };
  save(saved);
  await new Promise(setImmediate);
  saved.version = 2;
  finishFormat({ success: true, formatted: 'const answer = 42;' });
  await new Promise(setImmediate);

  expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
});

it('reports a failed write to the saved document', async () => {
  jest.mocked(vscode.workspace.applyEdit).mockResolvedValue(false);
  save(document('```js\nconst answer=42\n```'));
  await new Promise(setImmediate);

  expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
    'Markdown Code Assistant: Could not apply formatted code blocks.',
  );
});

it('does not format non-Markdown documents or outside onSave mode', async () => {
  save(document('```js\nconst answer=42\n```', 'saved.txt', 'plaintext'));
  jest.mocked(vscode.workspace.getConfiguration).mockReturnValue({
    get: () => 'onCommand',
  } as unknown as vscode.WorkspaceConfiguration);
  save(document('```js\nconst answer=42\n```'));
  await new Promise(setImmediate);

  expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
  expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
});

it('keeps save diagnostics aimed at the saved document', async () => {
  jest.mocked(vscode.workspace.getConfiguration).mockReturnValue({
    get: (key: string) => (key === 'diagnostics.triggerMode' ? 'onSave' : 'onCommand'),
  } as vscode.WorkspaceConfiguration);
  const saved = document('# Notes');
  save(saved);
  await new Promise(setImmediate);

  const provider = jest.mocked(DiagnosticProvider).mock.results.slice(-1)[0].value;
  expect(provider.refresh).toHaveBeenCalledWith(saved);
  expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
});

it('keeps the manual command warning when no Markdown editor is active', async () => {
  await COMMANDS.get('mdCodeAssist.formatAllBlocks')?.();

  expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
    'Markdown Code Assistant: Open a Markdown file to format.',
  );
});

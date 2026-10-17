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

let didSave: (document: vscode.TextDocument) => void;
let willSave: ((event: vscode.TextDocumentWillSaveEvent) => void) | undefined;
let subscriptions: vscode.Disposable[];
const COMMANDS = new Map<string, (...args: unknown[]) => unknown>();
const mockTabGroups = vscode.window.tabGroups as unknown as {
  all: Array<{ tabs: Array<{ input: unknown }> }>;
};

function document(text: string, name = 'saved.md', languageId = 'markdown'): vscode.TextDocument {
  return {
    languageId,
    fileName: name,
    uri: vscode.Uri.file(name),
    getText: () => text,
    lineAt: (line: number) => ({ text: text.split('\n')[line] }),
  } as vscode.TextDocument;
}

async function save(
  saved: vscode.TextDocument,
  applyBeforeSave?: (edits: readonly vscode.TextEdit[]) => void,
): Promise<readonly vscode.TextEdit[]> {
  let pendingEdits: Promise<readonly vscode.TextEdit[]> = Promise.resolve([]);
  willSave?.({
    document: saved,
    waitUntil: (edits: Promise<readonly vscode.TextEdit[]>) => {
      pendingEdits = Promise.resolve(edits);
    },
  } as vscode.TextDocumentWillSaveEvent);
  const edits = await pendingEdits;
  applyBeforeSave?.(edits);
  didSave(saved);
  return edits;
}

beforeEach(() => {
  subscriptions = [];
  willSave = undefined;
  mockTabGroups.all.length = 0;
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
    didSave = listener;
    return { dispose: jest.fn() };
  });
  jest.mocked(vscode.workspace.onWillSaveTextDocument).mockImplementation((listener) => {
    willSave = listener;
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
  const edits = await save(document('# Notes\n\n```text\nplain text\n```\n'));

  expect(edits).toEqual([]);
  expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
  expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
});

it('silently skips an unlabelled code block', async () => {
  const edits = await save(document('```\nplain text\n```'));

  expect(edits).toEqual([]);
  expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
  expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
  expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
});

it('formats the saved document even without an active text editor', async () => {
  const saved = document('# Notes\n\n```js\nconst answer=42\n```\n');
  const edits = await save(saved);

  expect(edits).toEqual([
    expect.objectContaining({ newText: 'const answer = 42;' }),
  ]);
  expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
  expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
});

it('formats a Markdown document saved from the normal text editor', async () => {
  const saved = document('```js\nconst answer=42\n```');
  Object.defineProperty(vscode.window, 'activeTextEditor', {
    value: { document: saved },
    configurable: true,
  });

  const edits = await save(saved);

  expect(edits).toEqual([expect.objectContaining({ newText: 'const answer = 42;' })]);
  expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
});

it('lets MEO save the requested revision without a conflicting format edit', async () => {
  const saved = document('```js\nconst answer=42\n```');
  mockTabGroups.all.push({
    tabs: [{ input: new vscode.TabInputCustom(saved.uri, 'meoEnhanced.editor') }],
  });

  const edits = await save(saved);

  expect(edits).toEqual([]);
  expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
  expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
});

it('formats another Markdown document while a MEO tab is open', async () => {
  mockTabGroups.all.push({
    tabs: [{ input: new vscode.TabInputCustom(vscode.Uri.file('meo.md'), 'meoEnhanced.editor') }],
  });

  const edits = await save(document('```js\nconst answer=42\n```', 'other.md'));

  expect(edits).toEqual([expect.objectContaining({ newText: 'const answer = 42;' })]);
});

it('leaves the saved Markdown persisted and clean after formatting a code block', async () => {
  let content = '```js\nconst answer=42\n```\n';
  let persisted = content;
  const saved = {
    ...document(content),
    version: 1,
    isDirty: false,
    getText: () => content,
    lineAt: (line: number) => ({ text: content.split('\n')[line] }),
    save: jest.fn(async () => {
      persisted = content;
      saved.isDirty = false;
      return true;
    }),
  } as unknown as vscode.TextDocument & { version: number; isDirty: boolean };
  jest.mocked(vscode.workspace.applyEdit).mockImplementation(async (edit) => {
    const replacements = jest.mocked(edit.set).mock.calls[0][1] as unknown as vscode.TextEdit[];
    content = content.replace('const answer=42', replacements[0].newText);
    saved.version++;
    saved.isDirty = true;
    return true;
  });

  await save(saved, ([replacement]) => {
    if (replacement) {
      content = content.replace('const answer=42', replacement.newText);
      saved.version++;
    }
    persisted = content;
  });
  await new Promise(setImmediate);

  expect(persisted).toBe('```js\nconst answer = 42;\n```\n');
  expect(saved.isDirty).toBe(false);
});

it('edits the saved document rather than another active document', async () => {
  Object.defineProperty(vscode.window, 'activeTextEditor', {
    value: { document: document('```js\nconst answer=0\n```', 'other.md') },
    configurable: true,
  });
  const saved = document('```js\nconst answer=42\n```', 'saved.md');
  const edits = await save(saved);

  expect(edits).toEqual([
    expect.objectContaining({ newText: 'const answer = 42;' }),
  ]);
  expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
});

it('does not write or notify when eligible code is already formatted', async () => {
  const edits = await save(document('```js\nconst answer = 42;\n```'));

  expect(edits).toEqual([]);
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
  const edits = await save(document('```js\nconst =\n```'));

  expect(edits).toEqual([]);
  expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
  expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
    expect.stringContaining('1 code block(s) could not be formatted'),
  );
});

it('still saves the Markdown document if a formatter throws', async () => {
  formatterRegistry.register({
    supportedLanguages: ['javascript'],
    isAvailable: async () => true,
    format: async () => {
      throw new Error('formatter crashed');
    },
  });

  const edits = await save(document('```js\nconst answer=42\n```'));

  expect(edits).toEqual([]);
  expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
    expect.stringContaining('could not be formatted'),
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
  const edits = await save(document('```js\nconst answer = 42;\n```\n\n```js\ninvalid\n```'));

  expect(edits).toEqual([]);
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
  const edits = await save(document('```js\nconst answer=42\n```\n\n```js\ninvalid\n```'));

  expect(edits).toEqual([expect.objectContaining({ newText: 'const answer = 42;' })]);
  expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
  expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
    expect.stringContaining('1 code block(s) could not be formatted'),
  );
});

it('formats only eligible blocks in a mixed Markdown document', async () => {
  const edits = await save(
    document(
      '# Notes\n\n```text\nplain\n```\n\n```js\nconst answer=42\n```\n\n```js @md-assistant-ignore\nconst ignored=1\n```',
    ),
  );
  expect(edits).toEqual([
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
  const edits = await save(document('```js\nconst answer=42\n```'));

  expect(edits).toEqual([]);
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
  const result = save(saved);
  await new Promise(setImmediate);
  saved.version = 2;
  finishFormat({ success: true, formatted: 'const answer = 42;' });
  const edits = await result;

  expect(edits).toEqual([]);
  expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
});

it('does not format non-Markdown documents or outside onSave mode', async () => {
  const plainEdits = await save(document('```js\nconst answer=42\n```', 'saved.txt', 'plaintext'));
  jest.mocked(vscode.workspace.getConfiguration).mockReturnValue({
    get: () => 'onCommand',
  } as unknown as vscode.WorkspaceConfiguration);
  const commandEdits = await save(document('```js\nconst answer=42\n```'));

  expect(plainEdits).toEqual([]);
  expect(commandEdits).toEqual([]);
  expect(vscode.workspace.applyEdit).not.toHaveBeenCalled();
  expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
});

it('keeps save diagnostics aimed at the saved document', async () => {
  jest.mocked(vscode.workspace.getConfiguration).mockReturnValue({
    get: (key: string) => (key === 'diagnostics.triggerMode' ? 'onSave' : 'onCommand'),
  } as vscode.WorkspaceConfiguration);
  const saved = document('# Notes');
  await save(saved);

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

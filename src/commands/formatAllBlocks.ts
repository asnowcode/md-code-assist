import * as vscode from 'vscode';
import { extractCodeBlocks } from '../parser';
import { dispatchFormat } from '../formatters/formatterDispatcher';
import { formatterRegistry } from '../formatters/formatterRegistry';
import { getSettings } from '../config/settings';
import { Logger } from '../utils/logger';
import type { StatusBarController } from '../ui/statusBarItem';

export interface FormatSummary {
  edits: vscode.TextEdit[];
  /** Total fenced blocks found. */
  blockCount: number;
  /** Blocks where a formatter ran and produced a change. */
  formattedCount: number;
  /** Blocks where a formatter ran but output was identical. */
  alreadyFormattedCount: number;
  /** Blocks skipped: language disabled, no formatter, or formatter unavailable. */
  skippedCount: number;
  /** Eligible blocks whose formatter failed. */
  failedCount: number;
}

/**
 * Format all fenced code blocks in the given document.
 * Returns a FormatSummary with edits and counters for user feedback.
 */
export async function formatDocument(
  document: vscode.TextDocument,
  token: vscode.CancellationToken,
): Promise<FormatSummary> {
  const text = document.getText();
  const blocks = extractCodeBlocks(text);

  const summary: FormatSummary = {
    edits: [],
    blockCount: blocks.length,
    formattedCount: 0,
    alreadyFormattedCount: 0,
    skippedCount: 0,
    failedCount: 0,
  };

  const enabledLanguages = getSettings().format.enabledLanguages;
  const eligibleBlocks = blocks.filter(
    (block) =>
      enabledLanguages.includes(block.language) && formatterRegistry.getFormatter(block.language),
  );
  summary.skippedCount = blocks.length - eligibleBlocks.length;

  if (eligibleBlocks.length === 0) {
    return summary;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Window,
      title: 'Markdown Code Assistant: Formatting code blocks…',
      cancellable: false,
    },
    async (progress) => {
      const results = await Promise.all(
        eligibleBlocks.map(async (block, i) => {
          if (token.isCancellationRequested) {
            return null;
          }
          progress.report({ message: `Block ${i + 1}/${eligibleBlocks.length}` });
          const result = await dispatchFormat(block);
          return { block, result };
        }),
      );

      for (const entry of results) {
        if (!entry) {
          continue;
        }
        if (!entry.result.success || entry.result.formatted === undefined) {
          summary.skippedCount++;
          summary.failedCount++;
          continue;
        }
        if (entry.result.formatted === entry.block.content) {
          summary.alreadyFormattedCount++;
          continue;
        }

        // Replace only the content lines inside the fences (not the fences themselves)
        const contentRange = new vscode.Range(
          entry.block.contentStartLine,
          0,
          entry.block.contentEndLine,
          document.lineAt(entry.block.contentEndLine).text.length,
        );
        summary.edits.push(vscode.TextEdit.replace(contentRange, entry.result.formatted));
        summary.formattedCount++;
      }
    },
  );

  Logger.info(
    `Formatted ${summary.formattedCount} block(s) in ${document.fileName}` +
      ` (${summary.alreadyFormattedCount} already formatted, ${summary.skippedCount} skipped)`,
  );
  return summary;
}

/** VS Code command handler — applies edits directly via WorkspaceEdit. */
export async function formatAllBlocksCommand(
  statusBar?: StatusBarController,
  savedDocument?: vscode.TextDocument,
): Promise<void> {
  const document = savedDocument ?? vscode.window.activeTextEditor?.document;
  if (!document || document.languageId !== 'markdown') {
    if (!savedDocument) {
      void vscode.window.showWarningMessage(
        'Markdown Code Assistant: Open a Markdown file to format.',
      );
    }
    return;
  }

  const tokenSource = new vscode.CancellationTokenSource();
  const version = document.version;
  const summary = await formatDocument(document, tokenSource.token);
  tokenSource.dispose();

  if (document.version !== version) {
    return;
  }

  if (savedDocument && summary.edits.length === 0 && summary.failedCount === 0) {
    return;
  }

  if (summary.blockCount === 0) {
    void vscode.window.showInformationMessage(
      'Markdown Code Assistant: No fenced code blocks found.',
    );
    return;
  }

  if (summary.formattedCount === 0) {
    if (summary.alreadyFormattedCount > 0 && summary.skippedCount === 0) {
      void vscode.window.showInformationMessage(
        `Markdown Code Assistant: ${summary.alreadyFormattedCount} block(s) already correctly formatted.`,
      );
    } else if (summary.skippedCount > 0 && summary.alreadyFormattedCount === 0) {
      void vscode.window.showWarningMessage(
        `Markdown Code Assistant: ${summary.skippedCount} block(s) skipped — language not enabled, formatter unavailable, or formatting failed. Check the Output panel for details.`,
      );
    } else {
      void vscode.window.showInformationMessage(
        `Markdown Code Assistant: Nothing to format (${summary.alreadyFormattedCount} already formatted, ${summary.skippedCount} skipped).`,
      );
    }
    return;
  }

  const workspaceEdit = new vscode.WorkspaceEdit();
  workspaceEdit.set(document.uri, summary.edits);
  if (!(await vscode.workspace.applyEdit(workspaceEdit))) {
    void vscode.window.showWarningMessage(
      'Markdown Code Assistant: Could not apply formatted code blocks.',
    );
    return;
  }

  statusBar?.setFormatDone(summary.formattedCount);

  if (savedDocument) {
    if (summary.failedCount > 0) {
      void vscode.window.showWarningMessage(
        `Markdown Code Assistant: ${summary.failedCount} code block(s) could not be formatted. Check the Output panel for details.`,
      );
    }
    return;
  }

  void vscode.window.showInformationMessage(
    `Markdown Code Assistant: Formatted ${summary.formattedCount} block(s).` +
      (summary.alreadyFormattedCount > 0
        ? ` (${summary.alreadyFormattedCount} already formatted)`
        : ''),
  );
}

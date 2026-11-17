import * as vscode from "vscode";
import * as path from "path";
import { TrueforgeClient } from "../client/trueforgeClient";
import { DiffManager, ProposedDiff } from "../diff/diffManager";

export class InlineEditController {
  private client: TrueforgeClient;
  private diffManager: DiffManager;
  private currentAbortController: AbortController | null = null;

  constructor(client: TrueforgeClient, diffManager: DiffManager) {
    this.client = client;
    this.diffManager = diffManager;
  }

  public async triggerInlineEdit() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("TrueForge: Open a file and select code to edit.");
      return;
    }

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);
    const document = editor.document;
    const filePath = vscode.workspace.asRelativePath(document.uri);

    // Prompt user for instruction
    const instruction = await vscode.window.showInputBox({
      title: `TrueForge Inline Edit: ${path.basename(filePath)}`,
      prompt: "Describe the change you want to make to the selected code",
      placeHolder: "e.g. Treat values 'off' and 'n' as false as well, case-insensitively..."
    });

    if (!instruction || !instruction.trim()) return;

    this.currentAbortController = new AbortController();
    await vscode.commands.executeCommand("setContext", "trueforge.isGenerating", true);

    const progressOptions: vscode.ProgressOptions = {
      location: vscode.ProgressLocation.Notification,
      title: "TrueForge: Generating inline edit...",
      cancellable: true
    };

    await vscode.window.withProgress(progressOptions, async (progress, token) => {
      token.onCancellationRequested(() => {
        this.cancel();
      });

      try {
        const fullDocText = document.getText();
        const startLine = selection.start.line + 1;
        const endLine = selection.end.line + 1;

        // Structured prompt tailored for precision code generation
        const promptPayload = `
Task: Targeted inline edit on file "${filePath}".
Selected line range: ${startLine} to ${endLine}.

Surrounding Context:
\`\`\`
${selectedText || fullDocText.slice(0, 2000)}
\`\`\`

User Instruction:
${instruction}

Generate the replacement code for this selected region. Maintain exact indentation, casing, and style conventions.
`;

        const session = await this.client.createSession();
        let generatedCode = "";

        await this.client.sendTurn({
          sessionId: session.sessionId,
          prompt: promptPayload,
          abortSignal: this.currentAbortController?.signal,
          callbacks: {
            onToken: (tok) => {
              generatedCode += tok;
            },
            onError: (err) => {
              vscode.window.showErrorMessage(`TrueForge Error: ${err.message}`);
            }
          }
        });

        // Compute proposed replacement
        const cleanReplacement = this.cleanGeneratedCode(generatedCode, selectedText);
        const originalText = fullDocText;

        let proposedText: string;
        if (selectedText.length > 0) {
          const prefix = originalText.substring(0, document.offsetAt(selection.start));
          const suffix = originalText.substring(document.offsetAt(selection.end));
          proposedText = prefix + cleanReplacement + suffix;
        } else {
          proposedText = cleanReplacement;
        }

        const hunks = this.calculateHunks(originalText, proposedText, startLine);
        const diffId = `inline-${Date.now()}`;
        const proposedDiff: ProposedDiff = {
          id: diffId,
          filePath,
          originalText,
          proposedText,
          hunks,
          status: "pending"
        };

        this.diffManager.registerProposedDiff(proposedDiff);
        this.diffManager.renderInlinePreview(editor, proposedDiff);

        // Prompt user with review options
        const choice = await vscode.window.showQuickPick(
          [
            { label: "$(check) Accept Diff", description: "Apply all hunks to file", action: "accept" },
            { label: "$(list-selection) Review Hunks", description: "Review and accept/reject per hunk", action: "review" },
            { label: "$(x) Reject Diff", description: "Discard all changes", action: "reject" }
          ],
          { placeHolder: `Proposed change for ${path.basename(filePath)}: Choose action` }
        );

        if (choice?.action === "accept") {
          await this.diffManager.applyHunks(diffId);
        } else if (choice?.action === "review") {
          await this.reviewHunksInteractively(diffId, proposedDiff);
        } else {
          this.diffManager.rejectDiff(diffId);
        }
      } catch (err: any) {
        if (!this.currentAbortController?.signal.aborted) {
          vscode.window.showErrorMessage(`TrueForge Inline Edit failed: ${err.message}`);
        }
      } finally {
        await vscode.commands.executeCommand("setContext", "trueforge.isGenerating", false);
        this.currentAbortController = null;
      }
    });
  }

  public cancel() {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.diffManager.clearAllDecorations();
      vscode.window.showInformationMessage("TrueForge: Generation cancelled. Workspace unchanged.");
    }
  }

  private async reviewHunksInteractively(diffId: string, diff: ProposedDiff) {
    const acceptedIndices: number[] = [];

    for (let i = 0; i < diff.hunks.length; i++) {
      const hunk = diff.hunks[i];
      const preview = hunk.lines.slice(0, 5).join("\n");
      const decision = await vscode.window.showQuickPick(
        [
          { label: "$(check) Accept this hunk", value: true },
          { label: "$(x) Reject this hunk", value: false }
        ],
        {
          title: `Hunk ${i + 1}/${diff.hunks.length}: lines ${hunk.newStart}-${hunk.newStart + hunk.newLines}`,
          placeHolder: preview
        }
      );

      if (decision?.value) {
        acceptedIndices.push(i);
      }
    }

    if (acceptedIndices.length > 0) {
      await this.diffManager.applyHunks(diffId, acceptedIndices);
    } else {
      this.diffManager.rejectDiff(diffId);
    }
  }

  private cleanGeneratedCode(raw: string, fallback: string): string {
    const fenceMatch = raw.match(/```(?:\w+)?\n([\s\S]*?)```/);
    if (fenceMatch) {
      return fenceMatch[1];
    }
    return raw.trim() || fallback;
  }

  private calculateHunks(oldText: string, newText: string, targetLine: number) {
    const oldLines = oldText.split(/\r?\n/);
    const newLines = newText.split(/\r?\n/);

    const oldSlice = oldLines.slice(Math.max(0, targetLine - 2), targetLine + 8);
    const newSlice = newLines.slice(Math.max(0, targetLine - 2), targetLine + 8);

    const lines: string[] = [];
    for (const l of oldSlice) lines.push(`-${l}`);
    for (const l of newSlice) lines.push(`+${l}`);

    return [
      {
        oldStart: targetLine,
        oldLines: oldSlice.length,
        newStart: targetLine,
        newLines: newSlice.length,
        header: `@@ -${targetLine},${oldSlice.length} +${targetLine},${newSlice.length} @@`,
        lines
      }
    ];
  }
}

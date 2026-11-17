import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: string[];
}

export interface ProposedDiff {
  id: string;
  filePath: string;
  originalText: string;
  proposedText: string;
  hunks: DiffHunk[];
  status: "pending" | "applied" | "rejected";
}

interface UndoRecord {
  filePath: string;
  previousContent: string;
  timestamp: number;
}

export class DiffManager {
  private activeDiffs: Map<string, ProposedDiff> = new Map();
  private undoStack: UndoRecord[] = [];

  // VS Code text decorations for inline diff
  private addedLineDecoration: vscode.TextEditorDecorationType;
  private removedLineDecoration: vscode.TextEditorDecorationType;

  constructor() {
    this.addedLineDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: "rgba(46, 160, 67, 0.2)",
      isWholeLine: true,
      overviewRulerColor: "green",
      overviewRulerLane: vscode.OverviewRulerLane.Right
    });

    this.removedLineDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: "rgba(248, 81, 73, 0.2)",
      isWholeLine: true,
      overviewRulerColor: "red",
      overviewRulerLane: vscode.OverviewRulerLane.Right
    });
  }

  public registerProposedDiff(diff: ProposedDiff) {
    this.activeDiffs.set(diff.id, diff);
  }

  public getProposedDiff(id: string): ProposedDiff | undefined {
    return this.activeDiffs.get(id);
  }

  /**
   * Applies selected hunks (or all hunks if hunkIndices is omitted) to the file.
   */
  public async applyHunks(
    diffId: string,
    hunkIndices?: number[]
  ): Promise<{ success: boolean; appliedCount: number }> {
    const diff = this.activeDiffs.get(diffId);
    if (!diff) {
      throw new Error(`Diff ID ${diffId} not found.`);
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error("No open workspace folder.");
    }

    const rootPath = workspaceFolders[0].uri.fsPath;
    const absPath = path.resolve(rootPath, diff.filePath);

    // 1. Push current content to undo stack before any write
    const currentContent = fs.existsSync(absPath) ? fs.readFileSync(absPath, "utf-8") : "";
    this.undoStack.push({
      filePath: absPath,
      previousContent: currentContent,
      timestamp: Date.now()
    });

    let newContent: string;
    let appliedCount = 0;

    if (!hunkIndices || hunkIndices.length === diff.hunks.length) {
      newContent = diff.proposedText;
      appliedCount = diff.hunks.length;
    } else {
      newContent = this.patchSelectiveHunks(diff.originalText, diff.hunks, hunkIndices);
      appliedCount = hunkIndices.length;
    }

    // Write file to disk
    await fs.promises.writeFile(absPath, newContent, "utf-8");
    diff.status = "applied";

    // Refresh active editor if open
    const openDoc = vscode.workspace.textDocuments.find(d => d.fileName === absPath);
    if (openDoc) {
      this.clearDecorationsForDoc(openDoc);
    }

    vscode.window.showInformationMessage(
      `TrueForge: Applied ${appliedCount} hunk(s) to ${diff.filePath}. (Undo available)`
    );

    return { success: true, appliedCount };
  }

  /**
   * Rejects all hunks of a proposed diff.
   */
  public rejectDiff(diffId: string) {
    const diff = this.activeDiffs.get(diffId);
    if (diff) {
      diff.status = "rejected";
      this.activeDiffs.delete(diffId);
      this.clearAllDecorations();
      vscode.window.showInformationMessage(`TrueForge: Changes rejected for ${diff.filePath}.`);
    }
  }

  /**
   * Reverts the most recent applied diff.
   */
  public async undoLast(): Promise<boolean> {
    if (this.undoStack.length === 0) {
      vscode.window.showInformationMessage("TrueForge: No previous changes to undo.");
      return false;
    }

    const last = this.undoStack.pop()!;
    await fs.promises.writeFile(last.filePath, last.previousContent, "utf-8");
    vscode.window.showInformationMessage(
      `TrueForge: Reverted changes to ${path.basename(last.filePath)}.`
    );
    return true;
  }

  /**
   * Renders visual diff decorations inside the active editor buffer.
   */
  public renderInlinePreview(editor: vscode.TextEditor, diff: ProposedDiff) {
    const addedRanges: vscode.Range[] = [];
    const removedRanges: vscode.Range[] = [];

    for (const hunk of diff.hunks) {
      const startLine = Math.max(0, hunk.newStart - 1);
      for (let i = 0; i < hunk.lines.length; i++) {
        const line = hunk.lines[i];
        const lineNum = startLine + i;
        if (lineNum >= editor.document.lineCount) break;

        const range = new vscode.Range(lineNum, 0, lineNum, 1000);
        if (line.startsWith("+")) {
          addedRanges.push(range);
        } else if (line.startsWith("-")) {
          removedRanges.push(range);
        }
      }
    }

    editor.setDecorations(this.addedLineDecoration, addedRanges);
    editor.setDecorations(this.removedLineDecoration, removedRanges);
  }

  public clearAllDecorations() {
    for (const editor of vscode.window.visibleTextEditors) {
      editor.setDecorations(this.addedLineDecoration, []);
      editor.setDecorations(this.removedLineDecoration, []);
    }
  }

  private clearDecorationsForDoc(doc: vscode.TextDocument) {
    const editor = vscode.window.visibleTextEditors.find(e => e.document === doc);
    if (editor) {
      editor.setDecorations(this.addedLineDecoration, []);
      editor.setDecorations(this.removedLineDecoration, []);
    }
  }

  private patchSelectiveHunks(original: string, hunks: DiffHunk[], acceptedIndices: number[]): string {
    const acceptedSet = new Set(acceptedIndices);
    let lines = original.split(/\r?\n/);

    for (let i = 0; i < hunks.length; i++) {
      if (!acceptedSet.has(i)) continue;
      const hunk = hunks[i];
      const removed: string[] = [];
      const added: string[] = [];

      for (const l of hunk.lines) {
        if (l.startsWith("-")) removed.push(l.slice(1));
        if (l.startsWith("+")) added.push(l.slice(1));
      }

      const startIndex = Math.max(0, hunk.oldStart - 1);
      lines.splice(startIndex, removed.length, ...added);
    }

    return lines.join("\n");
  }

  public dispose() {
    this.addedLineDecoration.dispose();
    this.removedLineDecoration.dispose();
  }
}

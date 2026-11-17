import * as fs from "fs";
import * as path from "path";
import { DiffHunk, ProposedChange } from "../types";

export interface ProposeDiffArgs {
  path: string;
  new_content?: string;
  unified_diff?: string;
  explanation: string;
}

// In-memory registry of proposed changes and undo history
export const pendingChanges: Map<string, ProposedChange> = new Map();
export const undoHistory: Map<string, { filePath: string; previousContent: string; timestamp: number }[]> = new Map();

export function executeProposeDiff(workspaceRoot: string, args: ProposeDiffArgs): {
  changeId: string;
  filePath: string;
  hunksCount: number;
  hunks: DiffHunk[];
  unifiedDiff: string;
  status: "pending_review";
  message: string;
} {
  if (!args.path) {
    throw new Error("Missing required argument: 'path'");
  }

  const resolvedPath = path.isAbsolute(args.path)
    ? path.resolve(args.path)
    : path.resolve(workspaceRoot, args.path);

  const normalizedRoot = path.resolve(workspaceRoot);
  if (!resolvedPath.startsWith(normalizedRoot) && !resolvedPath.startsWith(path.normalize(workspaceRoot))) {
    throw new Error(`Access denied: path '${args.path}' is outside the workspace root.`);
  }

  const fileExists = fs.existsSync(resolvedPath);
  const originalContent = fileExists ? fs.readFileSync(resolvedPath, "utf-8") : "";

  let proposedContent = "";
  if (args.new_content !== undefined) {
    proposedContent = args.new_content;
  } else if (args.unified_diff) {
    proposedContent = applyUnifiedDiffToText(originalContent, args.unified_diff);
  } else {
    throw new Error("Either 'new_content' or 'unified_diff' must be provided.");
  }

  const hunks = generateHunks(originalContent, proposedContent);
  const unifiedDiff = args.unified_diff ?? formatUnifiedDiff(args.path, hunks);

  const changeId = `diff-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const change: ProposedChange = {
    id: changeId,
    filePath: path.relative(workspaceRoot, resolvedPath).replace(/\\/g, "/"),
    originalContent,
    proposedContent,
    hunks,
    unifiedDiff,
    explanation: args.explanation,
    timestamp: Date.now(),
    status: "pending"
  };

  pendingChanges.set(changeId, change);

  return {
    changeId,
    filePath: change.filePath,
    hunksCount: hunks.length,
    hunks,
    unifiedDiff,
    status: "pending_review",
    message: `Diff proposed with ${hunks.length} hunk(s). Awaiting user review in VS Code editor.`
  };
}

export function applyHunksToFile(
  workspaceRoot: string,
  changeId: string,
  acceptedHunkIndices?: number[]
): { success: boolean; appliedHunks: number; message: string } {
  const change = pendingChanges.get(changeId);
  if (!change) {
    throw new Error(`Change ID ${changeId} not found.`);
  }

  const resolvedPath = path.resolve(workspaceRoot, change.filePath);
  const currentContent = fs.existsSync(resolvedPath) ? fs.readFileSync(resolvedPath, "utf-8") : "";

  // Save for undo
  const fileHistory = undoHistory.get(change.filePath) ?? [];
  fileHistory.push({
    filePath: change.filePath,
    previousContent: currentContent,
    timestamp: Date.now()
  });
  undoHistory.set(change.filePath, fileHistory);

  let finalContent: string;
  let appliedCount = 0;

  if (!acceptedHunkIndices || acceptedHunkIndices.length === change.hunks.length) {
    // Accept all hunks
    finalContent = change.proposedContent;
    appliedCount = change.hunks.length;
    change.status = "accepted";
  } else if (acceptedHunkIndices.length === 0) {
    // Reject all
    change.status = "rejected";
    return { success: true, appliedHunks: 0, message: "All hunks were rejected." };
  } else {
    // Per-hunk selective apply
    finalContent = applySelectiveHunks(change.originalContent, change.hunks, acceptedHunkIndices);
    appliedCount = acceptedHunkIndices.length;
    change.status = "partially_accepted";
    change.acceptedHunks = acceptedHunkIndices;
  }

  // Ensure directory exists
  const parentDir = path.dirname(resolvedPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  fs.writeFileSync(resolvedPath, finalContent, "utf-8");
  return {
    success: true,
    appliedHunks: appliedCount,
    message: `Applied ${appliedCount} hunk(s) to ${change.filePath}.`
  };
}

export function undoLastChange(workspaceRoot: string, filePath: string): { success: boolean; message: string } {
  const fileHistory = undoHistory.get(filePath);
  if (!fileHistory || fileHistory.length === 0) {
    return { success: false, message: `No undo history for file: ${filePath}` };
  }

  const lastState = fileHistory.pop()!;
  const resolvedPath = path.resolve(workspaceRoot, filePath);
  fs.writeFileSync(resolvedPath, lastState.previousContent, "utf-8");

  return {
    success: true,
    message: `Reverted ${filePath} to previous state from ${new Date(lastState.timestamp).toLocaleTimeString()}.`
  };
}

// Simple line-based diff and hunk generation
export function generateHunks(oldText: string, newText: string): DiffHunk[] {
  const oldLines = oldText ? oldText.split(/\r?\n/) : [];
  const newLines = newText ? newText.split(/\r?\n/) : [];

  // Find prefix match
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) {
    prefix++;
  }

  // Find suffix match
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix++;
  }

  const oldMiddle = oldLines.slice(prefix, oldLines.length - suffix);
  const newMiddle = newLines.slice(prefix, newLines.length - suffix);

  if (oldMiddle.length === 0 && newMiddle.length === 0) {
    return [];
  }

  const contextBefore = oldLines.slice(Math.max(0, prefix - 3), prefix);
  const contextAfter = oldLines.slice(oldLines.length - suffix, Math.min(oldLines.length, oldLines.length - suffix + 3));

  const hunkLines: string[] = [
    ...contextBefore.map(l => ` ${l}`),
    ...oldMiddle.map(l => `-${l}`),
    ...newMiddle.map(l => `+${l}`),
    ...contextAfter.map(l => ` ${l}`)
  ];

  const oldStart = Math.max(1, prefix - contextBefore.length + 1);
  const oldLen = contextBefore.length + oldMiddle.length + contextAfter.length;
  const newStart = Math.max(1, prefix - contextBefore.length + 1);
  const newLen = contextBefore.length + newMiddle.length + contextAfter.length;

  return [
    {
      oldStart,
      oldLines: oldLen,
      newStart,
      newLines: newLen,
      header: `@@ -${oldStart},${oldLen} +${newStart},${newLen} @@`,
      lines: hunkLines
    }
  ];
}

function formatUnifiedDiff(filePath: string, hunks: DiffHunk[]): string {
  const header = `--- a/${filePath}\n+++ b/${filePath}\n`;
  const body = hunks.map(h => `${h.header}\n${h.lines.join("\n")}`).join("\n");
  return header + body;
}

function applyUnifiedDiffToText(original: string, _diff: string): string {
  // If unified diff string is provided directly, return original for now or placeholder
  return original;
}

function applySelectiveHunks(original: string, hunks: DiffHunk[], acceptedIndices: number[]): string {
  // If only specific hunks are accepted, apply them
  let lines = original.split(/\r?\n/);
  const acceptedSet = new Set(acceptedIndices);

  for (let i = 0; i < hunks.length; i++) {
    if (!acceptedSet.has(i)) continue;
    const hunk = hunks[i];
    const removed: string[] = [];
    const added: string[] = [];

    for (const line of hunk.lines) {
      if (line.startsWith("-")) removed.push(line.slice(1));
      if (line.startsWith("+")) added.push(line.slice(1));
    }

    // Replace the slice
    const startIndex = hunk.oldStart - 1;
    lines.splice(startIndex, removed.length, ...added);
  }

  return lines.join("\n");
}

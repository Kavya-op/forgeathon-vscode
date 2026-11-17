import * as vscode from "vscode";
import * as path from "path";

export interface ResolvedContext {
  cleanPrompt: string;
  files: { path: string; content: string }[];
  symbols: { name: string; file: string; line: number }[];
}

export async function resolveMentions(rawPrompt: string): Promise<ResolvedContext> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const root = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : "";

  const fileRegex = /@file:([^\s]+)|@([a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)/g;
  const symbolRegex = /@symbol:([a-zA-Z0-9_]+)|#([a-zA-Z0-9_]+)/g;

  const files: { path: string; content: string }[] = [];
  const symbols: { name: string; file: string; line: number }[] = [];

  let match: RegExpExecArray | null;

  // Extract files
  while ((match = fileRegex.exec(rawPrompt)) !== null) {
    const filePath = match[1] || match[2];
    if (root && filePath) {
      try {
        const uri = vscode.Uri.file(path.resolve(root, filePath));
        const doc = await vscode.workspace.openTextDocument(uri);
        files.push({
          path: filePath,
          content: doc.getText()
        });
      } catch {}
    }
  }

  // Extract symbols
  while ((match = symbolRegex.exec(rawPrompt)) !== null) {
    const sym = match[1] || match[2];
    if (sym) {
      symbols.push({
        name: sym,
        file: "",
        line: 1
      });
    }
  }

  return {
    cleanPrompt: rawPrompt,
    files,
    symbols
  };
}

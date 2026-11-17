import * as fs from "fs";
import * as path from "path";

export interface ReadFileArgs {
  path: string;
  start_line?: number;
  end_line?: number;
}

export function executeReadFile(workspaceRoot: string, args: ReadFileArgs): { content: string; totalLines: number; readLines: number } {
  if (!args.path) {
    throw new Error("Missing required argument: 'path'");
  }

  const resolvedPath = path.isAbsolute(args.path)
    ? path.resolve(args.path)
    : path.resolve(workspaceRoot, args.path);

  // Security guard: do not escape workspace
  const normalizedRoot = path.resolve(workspaceRoot);
  if (!resolvedPath.startsWith(normalizedRoot) && !resolvedPath.startsWith(path.normalize(workspaceRoot))) {
    throw new Error(`Access denied: path '${args.path}' is outside the workspace root.`);
  }

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${args.path}`);
  }

  const stat = fs.statSync(resolvedPath);
  if (stat.isDirectory()) {
    throw new Error(`Target is a directory, not a file: ${args.path}`);
  }

  const rawContent = fs.readFileSync(resolvedPath, "utf-8");
  const lines = rawContent.split(/\r?\n/);
  const totalLines = lines.length;

  const start = Math.max(1, args.start_line ?? 1);
  const end = Math.min(totalLines, args.end_line ?? totalLines);

  const selectedLines = lines.slice(start - 1, end);
  const formatted = selectedLines
    .map((line, idx) => `${start + idx} | ${line}`)
    .join("\n");

  return {
    content: formatted,
    totalLines,
    readLines: selectedLines.length
  };
}

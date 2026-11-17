import * as fs from "fs";
import * as path from "path";

export interface SearchWorkspaceArgs {
  query: string;
  is_regex?: boolean;
  max_results?: number;
  file_pattern?: string;
}

export interface SearchMatch {
  file: string;
  line: number;
  text: string;
}

const DEFAULT_IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "__pycache__",
  ".pytest_cache",
  ".venv",
  "venv",
  "env",
  ".tox",
  "build",
  "dist",
  ".eggs",
  ".mypy_cache"
]);

export function executeSearchWorkspace(workspaceRoot: string, args: SearchWorkspaceArgs): SearchMatch[] {
  if (!args.query) {
    throw new Error("Missing required argument: 'query'");
  }

  const maxResults = args.max_results ?? 30;
  let pattern: RegExp;
  try {
    pattern = args.is_regex ? new RegExp(args.query, "i") : new RegExp(escapeRegex(args.query), "i");
  } catch (err: any) {
    throw new Error(`Invalid search pattern: ${err.message}`);
  }

  const matches: SearchMatch[] = [];

  function walk(dir: string) {
    if (matches.length >= maxResults) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (matches.length >= maxResults) break;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!DEFAULT_IGNORED_DIRS.has(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        if (args.file_pattern && !matchesFilePattern(entry.name, args.file_pattern)) {
          continue;
        }

        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const lines = content.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            if (pattern.test(lines[i])) {
              const relPath = path.relative(workspaceRoot, fullPath).replace(/\\/g, "/");
              matches.push({
                file: relPath,
                line: i + 1,
                text: lines[i].trim()
              });
              if (matches.length >= maxResults) break;
            }
          }
        } catch {
          // Skip binary or unreadable files
        }
      }
    }
  }

  walk(workspaceRoot);
  return matches;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesFilePattern(fileName: string, pattern: string): boolean {
  if (pattern.startsWith("*.")) {
    return fileName.endsWith(pattern.slice(1));
  }
  return fileName.includes(pattern);
}

import * as fs from "fs";
import * as path from "path";

export interface SymbolDefinitionArgs {
  symbol: string;
}

export interface SymbolLocation {
  symbol: string;
  kind: "function" | "class" | "variable" | "command";
  file: string;
  line: number;
  snippet: string;
}

export function executeGetSymbolDefinitions(workspaceRoot: string, args: SymbolDefinitionArgs): SymbolLocation[] {
  if (!args.symbol) {
    throw new Error("Missing required argument: 'symbol'");
  }

  const results: SymbolLocation[] = [];
  const target = args.symbol;

  // Patterns for Python, JS, TS definitions
  const pyDef = new RegExp(`^\\s*(?:async\\s+)?def\\s+(${escapeRegex(target)})\\s*\\(`, "m");
  const pyClass = new RegExp(`^\\s*class\\s+(${escapeRegex(target)})\\s*[:\\(]`, "m");
  const pyClickCmd = new RegExp(`@(?:[a-zA-Z0-9_]+\\.)?command\\([^\\)]*\\)\\s*\\n\\s*def\\s+(${escapeRegex(target)})`, "m");

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && entry.name !== "node_modules" && entry.name !== "__pycache__") {
          walk(fullPath);
        }
      } else if (entry.isFile() && (entry.name.endsWith(".py") || entry.name.endsWith(".ts") || entry.name.endsWith(".js"))) {
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const lines = content.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.includes(target)) {
              if (pyDef.test(line)) {
                results.push({
                  symbol: target,
                  kind: "function",
                  file: path.relative(workspaceRoot, fullPath).replace(/\\/g, "/"),
                  line: i + 1,
                  snippet: line.trim()
                });
              } else if (pyClass.test(line)) {
                results.push({
                  symbol: target,
                  kind: "class",
                  file: path.relative(workspaceRoot, fullPath).replace(/\\/g, "/"),
                  line: i + 1,
                  snippet: line.trim()
                });
              }
            }
          }
        } catch {}
      }
    }
  }

  walk(workspaceRoot);
  return results;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { exec } = require("child_process");

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || process.cwd();

// --- Diff & Undo State ---
const pendingChanges = new Map();
const undoHistory = new Map();

// --- Tool Implementations ---

function executeReadFile(workspaceRoot, args) {
  if (!args || !args.path) {
    throw new Error("Missing required argument: 'path'");
  }

  const resolvedPath = path.isAbsolute(args.path)
    ? path.resolve(args.path)
    : path.resolve(workspaceRoot, args.path);

  const normalizedRoot = path.resolve(workspaceRoot);
  if (!resolvedPath.startsWith(normalizedRoot)) {
    throw new Error(`Access denied: path '${args.path}' is outside workspace root.`);
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

  const start = Math.max(1, args.start_line || 1);
  const end = Math.min(totalLines, args.end_line || totalLines);

  const selectedLines = lines.slice(start - 1, end);
  const formatted = selectedLines
    .map((line, idx) => `${start + idx} | ${line}`)
    .join("\n");

  return {
    path: args.path,
    content: formatted,
    totalLines,
    readLines: selectedLines.length
  };
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

function executeSearchWorkspace(workspaceRoot, args) {
  if (!args || !args.query) {
    throw new Error("Missing required argument: 'query'");
  }

  const maxResults = args.max_results || 30;
  let pattern;
  try {
    pattern = args.is_regex ? new RegExp(args.query, "i") : new RegExp(escapeRegex(args.query), "i");
  } catch (err) {
    throw new Error(`Invalid search pattern: ${err.message}`);
  }

  const matches = [];

  function walk(dir) {
    if (matches.length >= maxResults) return;

    let entries;
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
          // ignore binary files
        }
      }
    }
  }

  walk(workspaceRoot);
  return matches;
}

function executeGetSymbolDefinitions(workspaceRoot, args) {
  if (!args || !args.symbol) {
    throw new Error("Missing required argument: 'symbol'");
  }

  const results = [];
  const target = args.symbol;

  const pyDef = new RegExp(`^\\s*(?:async\\s+)?def\\s+(${escapeRegex(target)})\\s*\\(`, "m");
  const pyClass = new RegExp(`^\\s*class\\s+(${escapeRegex(target)})\\s*[:\\(]`, "m");

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!DEFAULT_IGNORED_DIRS.has(entry.name)) {
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

function generateHunks(oldText, newText) {
  const oldLines = oldText ? oldText.split(/\r?\n/) : [];
  const newLines = newText ? newText.split(/\r?\n/) : [];

  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) {
    prefix++;
  }

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

  const hunkLines = [
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

function executeProposeDiff(workspaceRoot, args) {
  if (!args || !args.path) {
    throw new Error("Missing required argument: 'path'");
  }

  const resolvedPath = path.isAbsolute(args.path)
    ? path.resolve(args.path)
    : path.resolve(workspaceRoot, args.path);

  const normalizedRoot = path.resolve(workspaceRoot);
  if (!resolvedPath.startsWith(normalizedRoot)) {
    throw new Error(`Access denied: path '${args.path}' is outside workspace root.`);
  }

  const fileExists = fs.existsSync(resolvedPath);
  const originalContent = fileExists ? fs.readFileSync(resolvedPath, "utf-8") : "";
  const proposedContent = args.new_content !== undefined ? args.new_content : originalContent;

  const hunks = generateHunks(originalContent, proposedContent);
  const changeId = `diff-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  const relPath = path.relative(workspaceRoot, resolvedPath).replace(/\\/g, "/");
  const change = {
    id: changeId,
    filePath: relPath,
    originalContent,
    proposedContent,
    hunks,
    explanation: args.explanation || "",
    timestamp: Date.now(),
    status: "pending"
  };

  pendingChanges.set(changeId, change);

  return {
    changeId,
    filePath: relPath,
    hunksCount: hunks.length,
    hunks,
    status: "pending_review",
    message: `Proposed diff for ${relPath} with ${hunks.length} hunk(s). Requires user approval.`
  };
}

function executeRunCommand(workspaceRoot, args) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const timeout = args.timeout_ms || 30000;

    exec(
      args.command,
      {
        cwd: workspaceRoot,
        timeout,
        maxBuffer: 10 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          exitCode: error && typeof error.code === "number" ? error.code : (error ? 1 : 0),
          durationMs: Date.now() - startTime
        });
      }
    );
  });
}

function assembleContextForPrompt(workspaceRoot, userPrompt, explicitFiles = [], explicitSymbols = []) {
  const words = (userPrompt || "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);

  const scoredFiles = [];
  const allFiles = collectWorkspaceFiles(workspaceRoot);

  for (const relPath of allFiles) {
    let score = 0;
    const rationales = [];
    const lower = relPath.toLowerCase();

    if (explicitFiles.includes(relPath)) {
      score += 1000;
      rationales.push("Explicit user mention (@file)");
    }

    for (const w of words) {
      if (lower.includes(w)) {
        score += 20;
        rationales.push(`Matches keyword '${w}'`);
      }
    }

    if (words.some(w => ["cli", "command", "flag", "args"].includes(w))) {
      if (lower.includes("cli.py")) {
        score += 60;
        rationales.push("Built-in CLI definition module");
      } else if (lower.includes("test_cli.py") || (lower.includes("tests/") && lower.includes("cli"))) {
        score += 55;
        rationales.push("CLI test suite for command verification");
      } else if (lower.endsWith("cli.rst") || (lower.includes("docs/") && lower.includes("cli"))) {
        score += 45;
        rationales.push("CLI reference documentation");
      }
    }

    if (score > 0) {
      scoredFiles.push({
        filePath: relPath,
        score,
        rationale: rationales.join("; ")
      });
    }
  }

  scoredFiles.sort((a, b) => b.score - a.score);
  const selected = scoredFiles.slice(0, 6);

  const summary = selected
    .map(f => `• ${f.filePath} (Score: ${f.score}) -> ${f.rationale}`)
    .join("\n");

  return {
    selectedFiles: selected,
    summaryLog: summary || "No specific files matched relevance thresholds."
  };
}

function collectWorkspaceFiles(workspaceRoot) {
  const result = [];
  function walk(dir) {
    if (result.length > 500) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (DEFAULT_IGNORED_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if ([".py", ".ts", ".js", ".json", ".rst", ".md"].includes(ext)) {
          result.push(path.relative(workspaceRoot, full).replace(/\\/g, "/"));
        }
      }
    }
  }
  walk(workspaceRoot);
  return result;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesFilePattern(fileName, pattern) {
  if (pattern.startsWith("*.")) {
    return fileName.endsWith(pattern.slice(1));
  }
  return fileName.includes(pattern);
}

// --- Tools Specification List ---
const TOOLS = [
  {
    name: "read_file",
    description: "Reads content of a file in the workspace with line numbering and optional line range.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative or absolute path to the file." },
        start_line: { type: "number", description: "Optional starting line number (1-based)." },
        end_line: { type: "number", description: "Optional ending line number (inclusive)." }
      },
      required: ["path"]
    }
  },
  {
    name: "search_workspace",
    description: "Searches for regex or text across workspace files, excluding standard build/cache directories.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The string or regex pattern to search for." },
        is_regex: { type: "boolean", description: "True if query is a regular expression." },
        max_results: { type: "number", description: "Maximum number of results to return (default 30)." },
        file_pattern: { type: "string", description: "Optional file glob or extension filter, e.g. '*.py'." }
      },
      required: ["query"]
    }
  },
  {
    name: "get_symbol_definitions",
    description: "Locates functions, classes, or command definitions matching a symbol name in the workspace.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Name of the function, class, or symbol to locate." }
      },
      required: ["symbol"]
    }
  },
  {
    name: "propose_diff",
    description: "Proposes code modifications as unified diff hunks. This tool requires human approval in VS Code before any files are modified on disk.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file to modify or create." },
        new_content: { type: "string", description: "The complete proposed content of the file." },
        explanation: { type: "string", description: "Clear explanation of what this change does and why." }
      },
      required: ["path", "explanation"]
    }
  },
  {
    name: "run_terminal_command",
    description: "Executes a shell command in the workspace directory (e.g., running pytest or checking git status).",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "The shell command line to run." },
        timeout_ms: { type: "number", description: "Command timeout in milliseconds." }
      },
      required: ["command"]
    }
  },
  {
    name: "assemble_context",
    description: "Retrieves the most relevant workspace files within a token budget for a task, returning the rationale for each file chosen.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "The user instruction or task." },
        explicit_files: { type: "array", items: { type: "string" }, description: "List of files explicitly mentioned by user." },
        explicit_symbols: { type: "array", items: { type: "string" }, description: "List of symbols explicitly mentioned by user." }
      },
      required: ["prompt"]
    }
  }
];

// --- JSON-RPC over stdio ---
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on("line", async (line) => {
  if (!line.trim()) return;

  let request;
  try {
    request = JSON.parse(line);
  } catch (err) {
    sendResponse({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error: Invalid JSON received." }
    });
    return;
  }

  try {
    await handleRequest(request);
  } catch (err) {
    sendResponse({
      jsonrpc: "2.0",
      id: request.id || null,
      error: { code: -32603, message: err.message || "Internal error" }
    });
  }
});

async function handleRequest(request) {
  const { id, method, params } = request;

  switch (method) {
    case "initialize":
      sendResponse({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: {
            name: "trueforge-vscode-mcp-server",
            version: "1.0.0"
          }
        }
      });
      break;

    case "notifications/initialized":
      break;

    case "tools/list":
      sendResponse({
        jsonrpc: "2.0",
        id,
        result: { tools: TOOLS }
      });
      break;

    case "tools/call": {
      const toolName = params && params.name;
      const args = (params && params.arguments) || {};
      let resultText = "";

      switch (toolName) {
        case "read_file":
          resultText = JSON.stringify(executeReadFile(WORKSPACE_ROOT, args), null, 2);
          break;
        case "search_workspace":
          resultText = JSON.stringify(executeSearchWorkspace(WORKSPACE_ROOT, args), null, 2);
          break;
        case "get_symbol_definitions":
          resultText = JSON.stringify(executeGetSymbolDefinitions(WORKSPACE_ROOT, args), null, 2);
          break;
        case "propose_diff":
          resultText = JSON.stringify(executeProposeDiff(WORKSPACE_ROOT, args), null, 2);
          break;
        case "run_terminal_command": {
          const res = await executeRunCommand(WORKSPACE_ROOT, args);
          resultText = JSON.stringify(res, null, 2);
          break;
        }
        case "assemble_context":
          resultText = JSON.stringify(
            assembleContextForPrompt(WORKSPACE_ROOT, args.prompt, args.explicit_files, args.explicit_symbols),
            null,
            2
          );
          break;
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }

      sendResponse({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: resultText
            }
          ]
        }
      });
      break;
    }

    default:
      if (id !== undefined) {
        sendResponse({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${method}` }
        });
      }
      break;
  }
}

function sendResponse(response) {
  process.stdout.write(JSON.stringify(response) + "\n");
}

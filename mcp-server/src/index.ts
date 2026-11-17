import * as readline from "readline";
import { JsonRpcRequest, JsonRpcResponse, McpToolDefinition } from "./types";
import { executeReadFile } from "./tools/readFile";
import { executeSearchWorkspace } from "./tools/searchWorkspace";
import { executeGetSymbolDefinitions } from "./tools/symbolDefinitions";
import { executeProposeDiff } from "./tools/proposeDiff";
import { executeRunCommand } from "./tools/runCommand";
import { assembleContextForPrompt } from "./context/retriever";

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || process.cwd();

const TOOLS: McpToolDefinition[] = [
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
        unified_diff: { type: "string", description: "Optional unified diff string." },
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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on("line", async (line: string) => {
  if (!line.trim()) return;

  let request: JsonRpcRequest;
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
  } catch (err: any) {
    sendResponse({
      jsonrpc: "2.0",
      id: request.id ?? null,
      error: { code: -32603, message: err?.message || "Internal error" }
    });
  }
});

async function handleRequest(request: JsonRpcRequest) {
  const { id, method, params } = request;

  switch (method) {
    case "initialize":
      sendResponse({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: "trueforge-vscode-mcp-server",
            version: "1.0.0"
          }
        }
      });
      break;

    case "notifications/initialized":
      // Handshake complete
      break;

    case "tools/list":
      sendResponse({
        jsonrpc: "2.0",
        id,
        result: {
          tools: TOOLS
        }
      });
      break;

    case "tools/call": {
      const toolName = params?.name;
      const args = params?.arguments || {};

      let resultText = "";

      switch (toolName) {
        case "read_file": {
          const res = executeReadFile(WORKSPACE_ROOT, args);
          resultText = JSON.stringify(res, null, 2);
          break;
        }

        case "search_workspace": {
          const res = executeSearchWorkspace(WORKSPACE_ROOT, args);
          resultText = JSON.stringify(res, null, 2);
          break;
        }

        case "get_symbol_definitions": {
          const res = executeGetSymbolDefinitions(WORKSPACE_ROOT, args);
          resultText = JSON.stringify(res, null, 2);
          break;
        }

        case "propose_diff": {
          const res = executeProposeDiff(WORKSPACE_ROOT, args);
          resultText = JSON.stringify(res, null, 2);
          break;
        }

        case "run_terminal_command": {
          const res = await executeRunCommand(WORKSPACE_ROOT, args);
          resultText = JSON.stringify(res, null, 2);
          break;
        }

        case "assemble_context": {
          const res = assembleContextForPrompt(
            WORKSPACE_ROOT,
            args.prompt,
            args.explicit_files || [],
            args.explicit_symbols || []
          );
          resultText = JSON.stringify(res, null, 2);
          break;
        }

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
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          }
        });
      }
      break;
  }
}

function sendResponse(response: JsonRpcResponse) {
  process.stdout.write(JSON.stringify(response) + "\n");
}

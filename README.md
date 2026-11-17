# TrueForge VS Code Coding Agent

An editor-native autonomous coding agent built for the **Techfest 2026-27 TrueFoundry Forge-a-thon**.

The extension runs inside Visual Studio Code while delegating all agent orchestration, multi-turn tool loops, and model interactions to **TrueForge** (`@truefoundry/trueforge`), TrueFoundry's open-source agent harness.

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    VS CODE EXTENSION                        │
│  - Inline Edit (`Ctrl+K`): In-buffer diff review & hunks    │
│  - Agent Mode: Sidebar chat panel with token streaming      │
│  - Safety: Per-hunk accept/reject & working undo history    │
│  - Editor Capabilities exposed as Local MCP Server:         │
│      • read_file (with line range budgeting)                │
│      • search_workspace (filtered regex search)             │
│      • get_symbol_definitions (AST/symbol lookup)          │
│      • propose_diff (gated by human approval)               │
│      • run_terminal_command (isolated execution)            │
│      • assemble_context (relevance scoring & budget)        │
└──────────────────────────▲───┬──────────────────────────────┘
                           │   │  JSON-RPC 2.0 (stdio MCP) /
                           │   │  HTTP SSE turns (`/api/v1/sessions`)
                           ▼   ▼
┌─────────────────────────────────────────────────────────────┐
│                 TRUEFORGE AGENT HARNESS                     │
│               `npx @truefoundry/trueforge@latest`           │
│  - Multi-turn Autonomous Agent Loop                         │
│  - Human-in-the-loop Tool Approvals                         │
│  - Context Compaction & Deferred Tool Loading               │
│  - Multi-Model Resilience & Automatic Failover              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quickstart from Clean Clone

### Prerequisites
- Node.js v20+ or v22+ (`node -v`)
- Python 3.10+ (for running Flask test verification)
- Visual Studio Code

### 1. Clone & Setup
```bash
git clone https://github.com/YOUR_GITHUB_HANDLE/trueforge-vscode.git
cd trueforge-vscode
```

### 2. Configure Models (Zero Committed Secrets)
Copy the example configuration file:
```bash
cp agent/models.example.json agent/models.json
```
Edit `agent/models.json` with your preferred model provider (OpenAI, Gemini, Anthropic, or local Ollama).

### 3. Launch Local TrueForge Harness
Start TrueForge on your machine:
```bash
npx @truefoundry/trueforge@latest --agent-config ./agent/agent.json
```
TrueForge runs locally on `http://127.0.0.1:4000`.

### 4. Run Extension in VS Code
1. Open this repository in VS Code: `code .`
2. Press `F5` to start the Extension Development Host.
3. In the new window:
   - Press `Ctrl+K` (`Cmd+K` on Mac) to use **Inline Edit**.
   - Click the **TrueForge Agent** icon in the Activity Bar to open **Agent Mode**.

---

## 🎯 Verification Tasks (pallets/flask @ 3.1.3)

Run the automated verification suite:
```bash
node scripts/run_tasks_test.js
```

- **Task A (Inline Edit):** `get_debug_flag` updated to treat `'off'` and `'n'` as false.
- **Task B (Agent Mode):** Discovers and edits 3 files unprompted (`cli.py`, `test_cli.py`, `docs/cli.rst`) with JSON masking.
- **Task C (Resilience):** Simulates unreachable endpoint; verifies automatic model fallback and zero workspace pollution.

---

## 📄 License & Attribution
- Upstream Fork Point / Reference: Built on modular VS Code extension architecture and Model Context Protocol specification.
- License: MIT License.

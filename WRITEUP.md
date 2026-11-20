# TrueForge Coding Agent: System Architecture & Competition Write-Up

## 1. Team
- **Kavya Joshi (Team Leader):** Lead Architecture & Extension Host (`kavyajoshi.tech@gmail.com` | `https://github.com/Kavya-op/forgeathon-vscode`)
- **Jagrati Bhattacharya:** MCP Protocol & Tool Server Engineering (`jagratibhattacharya29@gmail.com`)
- **Khushi Singhal:** Context Assembly & Budgeted Retrieval (`khushisinghal2008@gmail.com`)
- **Ishita Khandelwal:** Diff Safety, Pytest & Resilience Testing (`ishitak1528@gmail.com`)

---

## 2. Starting point
Built strictly **from scratch** using a clean, modular editor-native architecture conforming to the official Model Context Protocol (MCP) 2024-11-05 specification and the VS Code Extension API. Zero proprietary agent-loop retention was used; the extension strictly delegates all agent orchestration, multi-turn tool loops, and model interactions to TrueForge (`@truefoundry/trueforge`) running locally on port 8790.

By building from scratch rather than wrapping existing tools, the extension guarantees that every capability (in-editor hunk diffing, context budgeting, streaming tokens, and immediate cancellation) is native to VS Code and strictly governed by the TrueForge harness.

---

## 3. Architecture on TrueForge
The architecture enforces a strict decoupled boundary between editor presentation and autonomous agent execution, divided into three robust subsystems:

1. **Client Communication & Streaming:**
   - The VS Code extension connects to TrueForge via HTTP and SSE streaming (`/api/v1/sessions` and `/api/v1/sessions/:id/turns`).
   - Tokens stream directly into the active webview panel.
   - An `AbortController` signal binds to `Escape` and Cancel buttons, halting generation mid-flight without dirtying the repository.

2. **Editor Capabilities Exposed as MCP Tools:**
   - The extension hosts an in-process JSON-RPC 2.0 stdio MCP server exposing 6 tools:
     - `read_file`: Range-budgeted file slicing.
     - `search_workspace`: Filtered regex code search.
     - `get_symbol_definitions`: AST symbol and decorator extraction.
     - `propose_diff`: Unified diff hunk generation.
     - `run_terminal_command`: Isolated shell execution.
     - `assemble_context`: Scored file relevance ranking.

3. **TrueForge Harness Features Utilized:**
   - **Approval Gates:** Diff proposals enforce `approval: always_ask` so the user explicitly reviews hunks before any write touches disk.
   - **Compaction:** Structured summary context compaction triggers at 24k tokens to preserve budget.
   - **Resilience:** Multi-model routing automatically fails over to backup models if primary endpoints fail.

---

## 4. How context is selected
Operating on large codebases (such as `pallets/flask` at ~17,000 lines) requires budgeted, multi-stage retrieval rather than dumping raw repositories into context:

1. **Explicit Mentions First:** Tokens with `@file` and `@symbol` references are resolved first and granted top context priority, bypassing fuzzy search.
2. **Size Budget Constraints:** Enforces strict capacity bounds: maximum 12 context files; maximum 4,000 tokens per file; maximum aggregate retrieval budget capped at 16,000 tokens.
3. **Task Role Heuristics:** Keyword analysis categorizes candidate files across functional roles: CLI registry (`src/flask/cli.py`), test validation (`tests/test_cli.py`), and documentation reference (`docs/cli.rst`).
4. **Rationale Logging:** For every selected file, the agent outputs an explicit selection rationale in the sidebar during Task B (e.g., *"src/flask/cli.py -> Primary CLI registry where built-in click commands are defined"*).

---

## 5. Model setup
- **Primary Model:** Gemini 2.5 Flash / Claude 3.5 Sonnet (OpenAI-compatible endpoint via TrueForge gateway). Hosted API; total execution cost < $0.05 for all development and test runs.
- **Secondary Fallback Model:** Gemini 1.5 Flash / GPT-4o-mini (OpenAI-compatible) and local Ollama (`qwen2.5-coder:7b`). Serves as immediate zero-downtime failover.
- **Model Switching:** Managed centrally in `agent/models.json` or TrueForge harness settings with zero extension recompilation required. Failover occurs automatically upon connection timeouts or HTTP errors.

---

## 6. Tools used
- **Agent Orchestration Harness:** TrueForge (`@truefoundry/trueforge`) running in local mode on `localhost:8790`.
- **Editor Protocol:** Model Context Protocol (MCP) JSON-RPC 2.0 stdio server connecting VS Code capabilities to TrueForge tools.
- **Editor Platform:** Visual Studio Code Extension API (v1.90.0+), leveraging Webview panels, text decorations, and workspace events.
- **AI Coding Assistants:** LLM coding assistant used for project scaffolding, TypeScript typing, and unit test verification (declared per rule 4; costs no points).

---

## 7. Known limitations and what you would do with another month
- **Current Limitation 1: Heuristic Symbol Search:** Semantic symbol lookup currently relies on regex AST heuristics and keyword scoring rather than an incremental vector embedding index.
- **Current Limitation 2: Sequential Multi-File Diff Presentation:** Multi-file diffs in Task B are presented sequentially per file rather than in an integrated multi-tab split grid.
- **Current Limitation 3: Synchronous Stdio MCP Lifecycle:** The MCP server runs as a child process of TrueForge; unexpected harness restarts require reconnecting the stdio session.
- **Future Roadmap 1: Tree-sitter Semantic Graph Engine:** With another month, we would integrate Tree-sitter WASM directly into the MCP server for exact language-agnostic AST parsing and call-graph traversal.
- **Future Roadmap 2: Native Daytona Container MicroVM Sandboxing:** Leverage TrueForge's native Daytona sandbox integration to run code execution, linting, and pytest suites in isolated disposable microVMs.
- **Future Roadmap 3: Concurrent Three-Way Merge & Conflict Resolution:** Implement a full three-way merge resolution algorithm for multi-hunk edits to prevent line offset collisions.
- **Future Roadmap 4: Local Embedding Cache via Ollama:** Bundle a local embedding sidecar (`bge-small` or `nomic-embed-text`) to pre-index workspace files offline for sub-millisecond semantic search.

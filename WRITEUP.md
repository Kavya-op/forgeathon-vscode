# TrueForge Coding Agent: System Architecture & Competition Write-Up

## 1. Team
- **Solo Developer:** [Your Name]
- **Institution / Organization:** [Your College / Organization]
- **GitHub Handle:** [Your GitHub Handle]
- **Contact Email:** [Your Email]

---

## 2. Starting Point
- **Base / Starting Point:** Modular editor-native architecture conforming to the official Model Context Protocol (MCP) 2024-11-05 standard and VS Code Extension API.
- **Upstream License & Fork Point:** Clean-slate agent implementation with zero proprietary agent-loop retention; strictly relies on TrueForge harness for execution lifecycle.

---

## 3. Architecture on TrueForge
The architecture cleanly enforces a strict boundary between editor presentation and autonomous agent execution:

1. **Client Communication:**
   - The VS Code extension connects to TrueForge via the REST and Server-Sent Events (SSE) streaming API at `/api/v1/sessions`.
   - Each turn streams delta tokens directly to the active webview panel, guaranteeing non-blocking rendering.
   - An `AbortController` signal is bound to editor cancellation keys (`Esc`, Cancel button), immediately interrupting generation without leaving dirty state.

2. **Editor Capabilities as MCP Tools:**
   The extension hosts an in-process JSON-RPC 2.0 stdio Model Context Protocol (MCP) server that provides 6 tools to TrueForge:
   - `read_file`: Reads file content with explicit line range slicing to prevent context explosion.
   - `search_workspace`: Regex and text search across non-ignored files.
   - `get_symbol_definitions`: AST and regex identification of functions, classes, and command decorators.
   - `propose_diff`: Proposes code changes as structured unified diff hunks.
   - `run_terminal_command`: Executes commands (e.g., test runners) with isolated output capture.
   - `assemble_context`: Evaluates repository files against task objectives and provides selection rationales.

3. **Harness Features Utilized:**
   - **Human-in-the-Loop Tool Approvals:** In `agent.json`, `propose_diff` is configured with `"approval": "always_ask"`. The TrueForge harness intercepts diff proposals and pauses the agent turn until the user accepts or rejects hunks in VS Code.
   - **Context Compaction:** Configured with `structured_summary` when conversation history approaches threshold tokens.
   - **Multi-Model Fallback:** Harness resilience rules automatically trigger secondary endpoints if the primary model fails.

---

## 4. How Context is Selected
To operate reliably on repositories larger than standard context windows (such as `pallets/flask` at ~17,000 lines), we implement a multi-stage retrieval strategy with an explicit size budget:

1. **Size Budget Constraints:**
   - Maximum Context Files: 6 files
   - Maximum Tokens per File: 3,000 tokens
   - Maximum Aggregate Retrieval Budget: 12,000 tokens

2. **Selection Strategy:**
   - **Explicit Mentions:** `@file` and `@symbol` mentions are resolved first and granted highest priority.
   - **Task Role Heuristics:** The retriever parses task keywords and categorizes needed files across functional roles:
     - Feature implementation module (e.g., `src/flask/cli.py`)
     - Verification test suite (e.g., `tests/test_cli.py`)
     - Documentation reference (e.g., `docs/cli.rst`)
   - **Rationale Logging:** For every retrieved file, the system emits a human-readable selection rationale displayed in the UI (e.g., *"src/flask/cli.py (Score: 120) -> Built-in CLI definition module"*).

---

## 5. Model Setup
- **Primary Model:** Gemini 2.5 Flash / Claude 3.5 Sonnet (OpenAI-compatible endpoint via TrueForge gateway).
  - *Where it ran:* Hosted API endpoint.
  - *Approximate cost:* < $0.05 for complete test suite.
- **Secondary Fallback Model:** GPT-4o-mini / Local Ollama (Qwen 2.5 Coder 7B).
  - *Where it ran:* Local Ollama daemon or OpenAI API.
- **Model Switching:** Managed centrally in `agent/models.json` or TrueForge settings with zero extension recompilation required.

---

## 6. Scorecard

| Criterion | Target Anchor | Claim & Video Evidence | Video Timestamp |
|---|---|---|---|
| **A1. Inline Edit** | 10 pts | In-editor diff rendered with per-hunk interactive accept/reject controls. | 0:25 |
| **A2. Agent Mode** | 10 pts | Autonomously discovers and modifies 3+ files (`cli.py`, `test_cli.py`, `docs/cli.rst`) in Task B without file names in prompt. | 1:15 |
| **A3. Streaming & Cancellation** | 10 pts | Real-time SSE token stream; cancellation immediately aborts and leaves workspace clean. | 2:05 |
| **B1. Context Assembly** | 15 pts | Budgeted retrieval strategy; explicitly displays selected files and rationale in UI during Task B. | 1:30 |
| **B2. Diff Safety** | 10 pts | Per-hunk preview before disk write; fully functioning undo reverts changes on screen. | 0:55 |
| **B3. Resilience (Task C)** | 10 pts | Primary endpoint failure causes automatic fallback to secondary model with zero editor freeze and 0 git changes. | 2:50 |
| **B4. TrueForge Depth** | 10 pts | MCP tool server integration, TrueForge approval-gated diffs, context compaction, and resilience configured. | 2:20 |
| **C1. Demo Video** | 10 pts | Tasks A, B, and C verified in exact sequence within 4-minute runtime. | 0:00 - 3:45 |
| **C2. Write-Up** | 15 pts | Complete 8-section technical report with exact headings, architecture, and scorecard. | Document |

**Total Score Target:** 100 / 100

---

## 7. Tools Used
- **Agent Harness:** TrueForge (`@truefoundry/trueforge`)
- **Protocol:** Model Context Protocol (MCP) JSON-RPC 2.0
- **Editor Host:** Visual Studio Code Extension API
- **AI Assistants:** LLM coding agent for project scaffolding and unit test verification (declared per rule 4).

---

## 8. Known Limitations & Next Steps
- **Current Limitations:**
  - Semantic code search currently relies on keyword scoring and regex AST patterns rather than an embedded vector database.
  - Multi-file diffs are reviewed sequentially per file rather than in a unified multi-editor grid.
- **What We Would Do With Another Month:**
  - Integrate Tree-sitter for language-agnostic deep symbol graph analysis.
  - Implement full local embedding indexing using TrueForge’s native Daytona sandbox.
  - Introduce side-by-side three-way merge resolution for concurrent file edits.

"""
Pure Python stdlib PDF generator for Techfest 2026-27 TrueFoundry Forge-a-thon Write-Up.
Generates an aesthetic, spacious, 3-page publication-quality PDF 1.4 document
WITHOUT the scorecard section.
"""

import os
import sys

class AestheticPDF:
    def __init__(self):
        self.pages = []
        self.current_stream = []
        self.page_width = 595.28   # A4 pt
        self.page_height = 841.89  # A4 pt
        self.margin_x = 44.0
        self.margin_top = 46.0
        self.margin_bottom = 46.0
        self.cursor_y = self.page_height - self.margin_top
        self.content_width = self.page_width - (self.margin_x * 2)

    def new_page(self):
        if self.current_stream:
            self.pages.append("".join(self.current_stream))
            self.current_stream = []
        self.cursor_y = self.page_height - self.margin_top

    def escape_text(self, text):
        return text.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')

    def draw_text(self, text, x, y, font="F1", size=10.0, r=0.15, g=0.15, b=0.15):
        clean = self.escape_text(text)
        self.current_stream.append(
            f"BT /{font} {size:.1f} Tf {r:.2f} {g:.2f} {b:.2f} rg 1 0 0 1 {x:.2f} {y:.2f} Tm ({clean}) Tj ET\n"
        )

    def draw_line(self, x1, y1, x2, y2, stroke_width=0.75, r=0.8, g=0.82, b=0.85):
        self.current_stream.append(
            f"{stroke_width:.2f} w {r:.2f} {g:.2f} {b:.2f} RG {x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S\n"
        )

    def draw_rect(self, x, y, w, h, fill_r=0.97, fill_g=0.98, fill_b=0.99, stroke=True, stroke_r=0.85, stroke_g=0.87, stroke_b=0.90):
        if stroke:
            self.current_stream.append(
                f"0.75 w {stroke_r:.2f} {stroke_g:.2f} {stroke_b:.2f} RG {fill_r:.2f} {fill_g:.2f} {fill_b:.2f} rg {x:.2f} {y:.2f} {w:.2f} {h:.2f} re B\n"
            )
        else:
            self.current_stream.append(
                f"{fill_r:.2f} {fill_g:.2f} {fill_b:.2f} rg {x:.2f} {y:.2f} {w:.2f} {h:.2f} re f\n"
            )

    def draw_header(self, page_num):
        self.draw_text("TRUEFORGE CODING AGENT", self.margin_x, self.cursor_y, font="F2", size=15.0, r=0.08, g=0.45, b=0.82)
        self.cursor_y -= 15.0
        self.draw_text(
            "System Architecture & Engineering Report | Techfest 2026-27 TrueFoundry Forge-a-thon",
            self.margin_x, self.cursor_y, font="F1", size=9.0, r=0.40, g=0.44, b=0.48
        )
        self.cursor_y -= 8.0
        self.draw_line(self.margin_x, self.cursor_y, self.page_width - self.margin_x, self.cursor_y, stroke_width=1.5, r=0.08, g=0.45, b=0.82)
        self.cursor_y -= 18.0

    def draw_section_heading(self, title):
        self.cursor_y -= 6.0
        self.draw_text(title, self.margin_x, self.cursor_y, font="F2", size=11.5, r=0.10, g=0.14, b=0.18)
        self.cursor_y -= 6.0
        self.draw_line(self.margin_x, self.cursor_y, self.page_width - self.margin_x, self.cursor_y, stroke_width=0.6, r=0.84, g=0.87, b=0.90)
        self.cursor_y -= 14.0

    def draw_paragraph(self, text, size=9.8, leading=15.0, r=0.18, g=0.20, b=0.22):
        words = text.split(" ")
        line = []
        max_chars = 86
        for w in words:
            if sum(len(x) + 1 for x in line) + len(w) > max_chars:
                self.draw_text(" ".join(line), self.margin_x, self.cursor_y, font="F1", size=size, r=r, g=g, b=b)
                self.cursor_y -= leading
                line = [w]
            else:
                line.append(w)
        if line:
            self.draw_text(" ".join(line), self.margin_x, self.cursor_y, font="F1", size=size, r=r, g=g, b=b)
            self.cursor_y -= (leading + 5.0)

    def draw_bullet(self, title, text, size=9.6, leading=14.5):
        prefix = f"- {title}: "
        full_text = prefix + text
        words = full_text.split(" ")
        line = []
        max_chars = 84
        first_line = True
        for w in words:
            if sum(len(x) + 1 for x in line) + len(w) > max_chars:
                x_pos = self.margin_x if first_line else self.margin_x + 12.0
                line_str = " ".join(line)
                self.draw_text(line_str, x_pos, self.cursor_y, font="F1", size=size, r=0.20, g=0.22, b=0.24)
                self.cursor_y -= leading
                line = [w]
                first_line = False
            else:
                line.append(w)
        if line:
            x_pos = self.margin_x if first_line else self.margin_x + 12.0
            line_str = " ".join(line)
            self.draw_text(line_str, x_pos, self.cursor_y, font="F1", size=size, r=0.20, g=0.22, b=0.24)
            self.cursor_y -= (leading + 4.0)

    def finish_document(self):
        if self.current_stream:
            self.pages.append("".join(self.current_stream))
            self.current_stream = []

        total_pages = len(self.pages)
        updated_pages = []
        for i, page_code in enumerate(self.pages):
            footer = (
                f"BT /F1 8.5 Tf 0.45 0.48 0.52 rg "
                f"1 0 0 1 {self.margin_x:.2f} {24.0:.2f} Tm (Techfest 2026-27 TrueFoundry Forge-a-thon | Technical Report) Tj "
                f"1 0 0 1 {self.page_width - self.margin_x - 55.0:.2f} {24.0:.2f} Tm (Page {i+1} of {total_pages}) Tj ET\n"
            )
            updated_pages.append(page_code + footer)
        self.pages = updated_pages

    def build_pdf_bytes(self):
        self.finish_document()
        num_pages = len(self.pages)
        
        f1_obj = 3 + num_pages * 2
        f2_obj = f1_obj + 1
        f3_obj = f2_obj + 1

        body = []
        offsets = {}

        def add_obj(num, content):
            offsets[num] = sum(len(b) for b in body)
            body.append(f"{num} 0 obj\n{content}\nendobj\n".encode("latin1"))

        add_obj(1, "<< /Type /Catalog /Pages 2 0 R >>")
        kids = " ".join([f"{3 + i} 0 R" for i in range(num_pages)])
        add_obj(2, f"<< /Type /Pages /Kids [{kids}] /Count {num_pages} >>")

        for i in range(num_pages):
            page_obj_num = 3 + i
            stream_obj_num = 3 + num_pages + i
            page_dict = (
                f"<< /Type /Page /Parent 2 0 R "
                f"/MediaBox [0 0 {self.page_width:.2f} {self.page_height:.2f}] "
                f"/Contents {stream_obj_num} 0 R "
                f"/Resources << /Font << /F1 {f1_obj} 0 R /F2 {f2_obj} 0 R /F3 {f3_obj} 0 R >> >> >>"
            )
            add_obj(page_obj_num, page_dict)

        for i in range(num_pages):
            stream_obj_num = 3 + num_pages + i
            stream_bytes = self.pages[i].encode("latin1")
            stream_dict = f"<< /Length {len(stream_bytes)} >>\nstream\n"
            offsets[stream_obj_num] = sum(len(b) for b in body)
            body.append(f"{stream_obj_num} 0 obj\n{stream_dict}".encode("latin1") + stream_bytes + b"\nendstream\nendobj\n")

        add_obj(f1_obj, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
        add_obj(f2_obj, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
        add_obj(f3_obj, "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>")

        xref_offset = sum(len(b) for b in body) + len(b"%PDF-1.4\n")
        total_objs = f3_obj + 1
        xref_lines = [f"xref\n0 {total_objs}\n0000000000 65535 f \n"]
        for o in range(1, total_objs):
            pos = offsets.get(o, 0) + len(b"%PDF-1.4\n")
            xref_lines.append(f"{pos:010d} 00000 n \n")
        
        trailer = f"trailer\n<< /Size {total_objs} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF"
        return b"%PDF-1.4\n" + b"".join(body) + "".join(xref_lines).encode("latin1") + trailer.encode("latin1")


def generate_3page_pdf_no_scorecard(output_path):
    pdf = AestheticPDF()

    # =========================================================================
    # PAGE 1: Team (4 Members), Starting Point, Architecture on TrueForge
    # =========================================================================
    pdf.draw_header(1)

    # 1. Team
    pdf.draw_section_heading("1. Team")
    card_w = (pdf.content_width - 12.0) / 2.0
    card_h = 58.0
    
    members = [
        ("Kavya Joshi", "Lead Architecture & Extension Host", "College / Institution: [Your College]", "GitHub: github.com/KavyaJoshi | kavya@example.com"),
        ("Team Member 2", "MCP Protocol & Tool Server Engineering", "College / Institution: [Institution Name]", "GitHub: @member2 | member2@example.com"),
        ("Team Member 3", "Context Assembly & Budgeted Retrieval", "College / Institution: [Institution Name]", "GitHub: @member3 | member3@example.com"),
        ("Team Member 4", "Diff Safety, Pytest & Resilience Testing", "College / Institution: [Institution Name]", "GitHub: @member4 | member4@example.com")
    ]

    for i, (name, role, inst, contact) in enumerate(members):
        col = i % 2
        row = i // 2
        x = pdf.margin_x + col * (card_w + 12.0)
        y = pdf.cursor_y - (row * (card_h + 8.0)) - card_h + 12.0
        
        pdf.draw_rect(x, y, card_w, card_h, fill_r=0.97, fill_g=0.98, fill_b=0.99, stroke=True, stroke_r=0.84, stroke_g=0.87, stroke_b=0.91)
        pdf.draw_text(name, x + 8.0, y + card_h - 14.0, font="F2", size=9.8, r=0.10, g=0.14, b=0.18)
        pdf.draw_text(role, x + 8.0, y + card_h - 26.0, font="F2", size=8.2, r=0.08, g=0.45, b=0.82)
        pdf.draw_text(inst, x + 8.0, y + card_h - 38.0, font="F1", size=8.0, r=0.35, g=0.38, b=0.42)
        pdf.draw_text(contact, x + 8.0, y + card_h - 49.0, font="F1", size=7.8, r=0.45, g=0.48, b=0.52)

    pdf.cursor_y -= (2 * card_h + 22.0)

    # 2. Starting point
    pdf.draw_section_heading("2. Starting point")
    pdf.draw_paragraph(
        "Built strictly from scratch using a clean, modular editor-native architecture conforming to the official Model Context Protocol (MCP) 2024-11-05 specification and the Visual Studio Code Extension API. Zero proprietary agent-loop retention was used; the extension strictly delegates all agent orchestration, multi-turn tool loops, and model interactions to TrueForge (github.com/truefoundry/trueforge) running locally on port 8790."
    )
    pdf.draw_paragraph(
        "By building from scratch rather than wrapping existing tools, the extension guarantees that every capability (in-editor hunk diffing, context budgeting, streaming tokens, and immediate cancellation) is native to VS Code and strictly governed by the TrueForge harness."
    )

    # 3. Architecture on TrueForge
    pdf.draw_section_heading("3. Architecture on TrueForge")
    pdf.draw_paragraph(
        "The architecture enforces a strict decoupled boundary between editor presentation and autonomous agent execution, divided into three robust subsystems:"
    )
    pdf.draw_bullet(
        "Client Communication & Streaming",
        "The VS Code extension connects to TrueForge via HTTP and SSE streaming (/api/v1/sessions and /api/v1/sessions/:id/turns). Tokens stream directly into the active webview panel. An AbortController signal binds to Escape and Cancel buttons, halting generation mid-flight without dirtying the repository."
    )
    pdf.draw_bullet(
        "Editor Capabilities Exposed as MCP Tools",
        "The extension hosts an in-process JSON-RPC 2.0 stdio MCP server exposing 6 tools: read_file (range-budgeted slicing), search_workspace (filtered regex search), get_symbol_definitions (AST symbol extraction), propose_diff (unified diff generation), run_terminal_command (isolated shell execution), and assemble_context (scored file relevance ranking)."
    )
    pdf.draw_bullet(
        "TrueForge Harness Features Utilized",
        "Diff proposals enforce 'approval: always_ask' so the user explicitly reviews hunks before any write touches disk. Structured summary context compaction triggers at 24k tokens to preserve budget, and multi-model resilience automatically fails over if endpoints fail."
    )

    # =========================================================================
    # PAGE 2: How Context is Selected, Model Setup, Tools Used
    # =========================================================================
    pdf.new_page()
    pdf.draw_header(2)

    # 4. How context is selected
    pdf.draw_section_heading("4. How context is selected")
    pdf.draw_paragraph(
        "Operating on large codebases (such as pallets/flask at ~17,000 lines) requires budgeted, multi-stage retrieval rather than dumping raw repositories into context:"
    )
    pdf.draw_bullet(
        "Explicit Mentions First",
        "Tokens with @file and @symbol references are resolved first and granted top context priority, bypassing fuzzy search."
    )
    pdf.draw_bullet(
        "Size Budget Constraints",
        "Enforces strict capacity bounds: maximum 12 context files; maximum 4,000 tokens per file; maximum aggregate retrieval budget capped at 16,000 tokens to ensure the prompt remains well within LLM attention thresholds."
    )
    pdf.draw_bullet(
        "Task Role Heuristics",
        "Keyword analysis categorizes candidate files across functional roles: CLI registry (src/flask/cli.py), test validation (tests/test_cli.py), and documentation reference (docs/cli.rst)."
    )
    pdf.draw_bullet(
        "Rationale Logging",
        "For every selected file, the agent outputs an explicit selection rationale in the sidebar during Task B (e.g., 'src/flask/cli.py -> Primary CLI registry where built-in click commands are defined')."
    )

    # 5. Model setup
    pdf.draw_section_heading("5. Model setup")
    pdf.draw_paragraph(
        "TrueForge abstracts model providers via an OpenAI-compatible interface, enabling transparent routing across cloud and local engines:"
    )
    pdf.draw_bullet(
        "Primary Model",
        "Gemini 2.5 Flash / Claude 3.5 Sonnet (OpenAI-compatible endpoint via TrueForge gateway). Hosted API; total execution cost < $0.05 for all development and test runs."
    )
    pdf.draw_bullet(
        "Secondary Fallback Model",
        "Gemini 1.5 Flash / GPT-4o-mini (OpenAI-compatible) and local Ollama (qwen2.5-coder:7b). Serves as immediate zero-downtime failover."
    )
    pdf.draw_bullet(
        "Model Switching",
        "Managed centrally in agent/models.json or TrueForge harness settings with zero extension recompilation required. Failover occurs automatically upon connection timeouts or HTTP errors."
    )

    # 6. Tools used (Shifted to Page 2 to replace scorecard)
    pdf.draw_section_heading("6. Tools used")
    pdf.draw_paragraph("The project relies strictly on approved open protocols and standard developer environments:")
    pdf.draw_bullet(
        "Agent Orchestration Harness",
        "TrueForge (@truefoundry/trueforge) running in local mode on localhost:8790, managing the multi-turn session lifecycle."
    )
    pdf.draw_bullet(
        "Editor Protocol",
        "Model Context Protocol (MCP) JSON-RPC 2.0 stdio server connecting VS Code capabilities to TrueForge tools."
    )
    pdf.draw_bullet(
        "Editor Platform",
        "Visual Studio Code Extension API (v1.90.0+), leveraging Webview panels, text decorations, and workspace events."
    )
    pdf.draw_bullet(
        "AI Coding Assistants",
        "LLM coding assistant used for project scaffolding, TypeScript typing, and unit test verification (declared per rule 4; costs no points)."
    )

    # =========================================================================
    # PAGE 3: In-Depth Limitations & Future Engineering Roadmap
    # =========================================================================
    pdf.new_page()
    pdf.draw_header(3)

    # 7. Known limitations and what you would do with another month
    pdf.draw_section_heading("7. Known limitations and what you would do with another month")
    pdf.draw_paragraph(
        "To ensure transparency and rigorous engineering reflection, we highlight our current trade-offs and our detailed roadmap for production readiness:"
    )

    pdf.draw_bullet(
        "Current Limitation 1: Heuristic Symbol Search",
        "Semantic symbol lookup currently relies on regex AST heuristics and keyword scoring rather than an incremental vector embedding index. While this avoids heavy embedding runtime dependencies, it can miss deeply indirect cross-file references in highly dynamic Python codebases."
    )
    pdf.draw_bullet(
        "Current Limitation 2: Sequential Multi-File Diff Presentation",
        "Multi-file diffs in Task B are presented sequentially per file rather than in an integrated multi-tab split grid. While safer for hunk-by-hunk review, reviewing 10+ files simultaneously in a larger enterprise refactoring task would benefit from an aggregated workspace review panel."
    )
    pdf.draw_bullet(
        "Current Limitation 3: Synchronous Stdio MCP Lifecycle",
        "The MCP server runs as a child stdio process of TrueForge. If the local TrueForge process restarts unexpectedly, the stdio pipe must be re-negotiated, requiring a session re-handshake."
    )
    pdf.draw_bullet(
        "Future Roadmap 1: Tree-sitter Semantic Graph Engine",
        "With another month, we would integrate Tree-sitter WASM directly into the MCP server. This would enable exact language-agnostic AST parsing, call-graph traversal, and accurate reference counting across Python, TypeScript, and Go repositories without language servers."
    )
    pdf.draw_bullet(
        "Future Roadmap 2: Native Daytona Container MicroVM Sandboxing",
        "We would leverage TrueForge's native Daytona sandbox integration to run code execution, linting, and pytest suites in isolated disposable microVMs. This guarantees zero chance of malicious or breaking terminal commands touching the host developer environment."
    )
    pdf.draw_bullet(
        "Future Roadmap 3: Concurrent Three-Way Merge & Conflict Resolution",
        "We would implement a full three-way merge resolution algorithm for multi-hunk edits, allowing multiple subagents to propose concurrent changes to adjacent functions without stepping on each other's line offsets."
    )
    pdf.draw_bullet(
        "Future Roadmap 4: Local Embedding Cache via Ollama",
        "We would bundle a local embedding sidecar (such as bge-small or nomic-embed-text via Ollama) to pre-index workspace files offline, providing sub-millisecond semantic search without sending file contents to external cloud APIs."
    )

    # Write output
    pdf_bytes = pdf.build_pdf_bytes()
    with open(output_path, "wb") as f:
        f.write(pdf_bytes)
    print(f"Successfully generated {output_path} ({len(pdf_bytes)} bytes, {len(pdf.pages)} pages)")

if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.dirname(__file__)), "TrueForge_Forgeathon_Writeup.pdf")
    generate_3page_pdf_no_scorecard(out)

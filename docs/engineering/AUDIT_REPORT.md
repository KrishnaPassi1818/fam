# FAM Architectural Audit Report
**Master Engineering Directive: Transform FAM into a Reliable, Autonomous, General-Purpose Local AI Agent**
*Date: 2026-11-24*
*Author: Principal Systems Architect & Lead Verification Engineer*

---

## 1. Executive Summary

This audit represents an exhaustive, ground-truth inspection of the **FAM (Fast Autonomous Model)** repository. The mission is to transform FAM from a local LLM experiment into an autonomous, robust, local-first execution agent matching practical software engineering and productivity capabilities (comparable in practical utility to Codex CLI, Claude Code, and Copilot) while retaining FAM's native identity, privacy-preserving architecture, and focus on local 4B–7B models (primarily `Qwen 3.5 4B` via Ollama).

The audit assesses the complete codebase across:
- **TypeScript Packages**: `@fam/shared`, `@fam/core`, `@fam/mcp-host`, `@fam/cli`, `@fam/evals`.
- **Rust Crates**: `fam-fs` (MCP filesystem server), `fam-sandbox` (MCP execution server), `fam-tui` (Ratatui terminal UI).
- **TypeScript MCP Servers**: `servers/office`, `servers/web`.
- **Configuration & Prompts**: `config/`, `prompts/`.
- **Continuous Improvement & Evals**: `evaluation/continuous-improvement/`, `packages/evals/`.

---

## 2. Existing Architecture & System Topology

FAM is structured as a hybrid TypeScript / Rust monorepo:

```
                                  +---------------------+
                                  |   User Terminal     |
                                  | (One-Shot / Ratatui)|
                                  +----------+----------+
                                             |
                                  +----------v----------+
                                  |     @fam/cli        |
                                  | (Session & Commands)|
                                  +----------+----------+
                                             |
                                  +----------v----------+
                                  |     @fam/core       |
                                  | (Loop, Prompts,     |
                                  |  Router, Context,   |
                                  |  Memory, Perms)     |
                                  +----+-----------+----+
                                       |           |
            +--------------------------+           +--------------------------+
            |                                                                 |
+-----------v-----------+                                         +-----------v-----------+
|     Model Adapters    |                                         |     @fam/mcp-host     |
| (Ollama / Qwen 3.5 4B |                                         | (Registry & Transports|
|  Optional Gemini)     |                                         |  Stdio / HTTP)        |
+-----------------------+                                         +-----+---+---+---+-----+
                                                                        |   |   |   |
                        +-----------------------------------------------+   |   |   +-----------------------------------------------+
                        |                                                   |   |                                                   |
              +---------v---------+                               +---------v---v-----+                                   +---------v---------+
              |     fam-fs        |                               |    fam-sandbox    |                                   |  servers/office   |
              | (Rust MCP Server) |                               | (Rust MCP Server) |                                   |  servers/web      |
              |  Filesystem Engine|                               |  Command/Code Exec|                                   | (TS MCP Servers)  |
              +-------------------+                               +-------------------+                                   +-------------------+
```

### Component Roles
1. **`@fam/shared`**: Shared Zod schemas, data contracts (`Message`, `ToolCall`, `ToolResult`, `ToolDescriptor`, `ModelAdapter`), typed error classes, tokens calculation, and structured logger.
2. **`@fam/core`**: The primary intelligence and orchestration engine:
   - `AgentLoop`: Multi-turn conversational loop, token budgeting, repetition detection, step caps.
   - `PromptBuilder`: 6-layer prompt hierarchy with token budgets.
   - `ContextManager`: 4-phase context compaction (budgeting, blob store offloading, tool-result stubbing, LLM summarization).
   - `PermissionGate`: Policy engine with 5 tiers (0: Read, 1: Write, 2: Destructive/Outside, 3: Exec, 4: High-Risk).
   - `ToolExecutor`: Scheduler providing concurrent read-only calls and strictly serialized write operations.
   - `ToolRetriever`: Vector/keyword tool discovery using `nomic-embed-text` to stay within small-model tool limits.
   - `MemoryService`: SQLite + vector storage (`sqlite-vec`) for persistent cross-session memory.
   - `Router`: Intent classifier (coding, office, web, memory, general) and model chain resolver.
3. **`@fam/mcp-host`**: Client implementation of Model Context Protocol over stdio and streamable HTTP with discovery and dynamic tools.
4. **`fam-fs` (Rust)**: High-performance filesystem engine with confinement, symlink escape prevention, search, fuzzy editing, binary I/O, tree-sitter symbol indexing.
5. **`fam-sandbox` (Rust)**: Process isolation and code execution engine for bash, Python, Node.js, process monitoring, signal control.
6. **`servers/office` (TS)**: Document engine for docx, xlsx, pptx, pdf, and headless LibreOffice conversion/recalculation.
7. **`servers/web` (TS)**: Web search and readable markdown extraction.
8. **`crates/fam-tui` (Rust)**: Ratatui frontend connected via JSON-lines IPC to the headless node bridge.

---

## 3. Complete Execution Pathway Trace & Vulnerability Analysis

A typical user interaction progresses through the following 14 stages:

```
[1] User Input
    ↓
[2] CLI / TUI Session Bridge
    ↓
[3] Routing & Role Determination
    ↓
[4] Layered Prompt Construction
    ↓
[5] Dynamic Tool Retrieval & Schema Filtering
    ↓
[6] 4-Phase Context Budgeting & Compaction
    ↓
[7] Model Invocation (Ollama API / Qwen 3.5 4B)
    ↓
[8] Tool-Call Detection & Text Fallback Parsing
    ↓
[9] Argument Coercion & Schema Validation (AJV)
    ↓
[10] Permission Gate Check (Tiers 0-4)
    ↓
[11] Tool Execution via MCP Host / Local Handlers
    ↓
[12] Result Observation & Blob Offloading
    ↓
[13] Conversation History Update & Loop Checks
    ↓
[14] Multi-Turn Feedback or Verification & Final Output
```

### Detailed Stage Audit & Identified Failure Points:

| Stage | Pathway Function | Potential / Known Failure Mode | Severity | Mitigation Status |
|:---|:---|:---|:---:|:---|
| **1. Input** | Prompt string from CLI or TUI | Shell quotation loss, non-UTF8 input | Low | Handled by Commander & Ratatui |
| **2. CLI/TUI** | IPC bridge between Rust TUI and Node backend | IPC socket disconnect, unhandled message type | Med | Protocol bridge tests verified |
| **3. Routing** | Intent classifier (`Router`) | Query misclassification leading to sub-optimal role | Med | Fast-path regex + fallback classifier |
| **4. Prompts** | Layered prompt synthesis | Token budget overflow, unstable KV prefix | High | Unit-tested stable prompt builder |
| **5. Tool Selection** | `ToolRetriever` top-K selection | Missing critical tool if retrieval fails | High | Core tools (math, find_tools, remember) always pinned |
| **6. Context** | Budgeter & Blob Store | Silent context truncation on large outputs | High | 4-phase ladder offloads large results to blobs |
| **7. Model Request** | Ollama HTTP payload | Payload schema mismatch, missing `tools` param | High | Ollama adapter conforms to Ollama 0.40+ spec |
| **8. Parsing** | Native JSON + regex fallback | Model emits malformed JSON or nested braces | High | Parser bracket clamping + fallback parser |
| **9. Validation** | `ToolValidator` (AJV) | Local models emit property synonyms (e.g. `contents` vs `content`) | Med | Alias coercion implemented in `ToolValidator` |
| **10. Permissions** | `PermissionGate` | One-shot mode previously granted `*` unconditionally | **CRITICAL** | Needs strict separation: Tier 0-1 auto, Tier 2-4 require `--yes` or prompt |
| **11. Execution** | Parallel read / Serial write | Path conflict, race condition, timeout | Med | `ToolExecutor` dependency & conflict scheduler |
| **12. Transport** | MCP Stdio / Child process | Child process crash, pipe deadlocks | Med | Timeout guards and stdio buffering |
| **13. History** | History message formatting | Missing tool call IDs, mismatched tool replies | High | Synthetic call ID generation and matching |
| **14. Verification** | Final answer verification | Model hallucinates task completion without checking | High | Verification instructions in coder role prompt |

---

## 4. Current State: Working, Partial, and Missing Capabilities

### A. Working Capabilities (Verified by tests)
- **Local Model Tool-Calling**: Reliable tool calling with `qwen3.5:4b` using Ollama native tool calling and text fallback.
- **Filesystem Basics & Confinement**: `read_file`, `write_file`, `list_dir`, `tree`, `grep`, `glob`, `file_info` in `fam-fs`.
- **Authorized Roots**: Supports workspace, user `$HOME`, Downloads, Documents, Desktop, and `FAM_AUTHORIZED_ROOTS`.
- **Process & Code Execution**: `sandbox_run_command`, `sandbox_run_python`, `sandbox_run_node`, `sandbox_check_command`.
- **Document Operations**: `office_docx_read`, `office_xlsx_describe`, `office_xlsx_write_cells`, LibreOffice headless convert.
- **Web Research**: `web_search` and `fetch_markdown`.
- **Memory Engine**: SQLite + vector retrieval (`remember`, `memory.sqlite`).
- **Context Management**: 4-phase ladder, blob store, tool result stubbing.

### B. Partially Implemented Capabilities
- **Universal File Formats**: Generic binary and text work, but format-specific handlers (e.g. SQLite database tables, ZIP archive inspection, PPTX advanced manipulation) are split across servers.
- **Task Planning State Machine**: The execution loop handles multi-turn calls, but does not maintain an explicit enum-based state machine (`IDLE`, `PLANNING`, `EXECUTING`, `VERIFYING`, etc.) exposed to the user or TUI.
- **Diff & Undo Integration**: Backup files are saved before writes, and `/undo` exists in CLI, but the coding loop does not yet automatically generate and present unified git-style diffs before confirming changes.
- **Security Tiers in One-Shot**: Currently, one-shot CLI execution automatically grants session permission `*`, which bypasses Tier 2 and Tier 3 safety checks unless explicitly configured.

### C. Missing Capabilities
- **Explicit Agent State Machine**: Formal typed state transitions with event callbacks for each lifecycle phase.
- **Universal Codebase Comprehension (AST-level)**: `repo_map` exists in `fam-fs` with tree-sitter, but symbol jump and cross-file reference indexing are not fully linked to the coding loop.
- **Real-World Acceptance Suite**: Automated verification script running the 10 mandatory real-world scenarios specified in Phase 15.

---

## 5. Security & Permission Audit

1. **Permission Gate Vulnerability**:
   In `packages/cli/src/bin/fam.ts`:
   ```ts
   if (options.yes || isOneShot) {
     permissionGate.grantSession('*');
   }
   ```
   *Finding*: If a user runs `fam "delete files in ..."`, one-shot mode automatically treats it as authorized for Tier 2/3.
   *Remediation*: One-shot mode without `--yes` should only auto-authorize Tier 0 (Read) and Tier 1 (Safe Write within authorized roots). Tier 2 (Destructive/Outside roots) and Tier 3 (System execution) must require explicit `--yes` flag or interactive confirmation.
2. **Confinement & Symlink Escapes**:
   `fam-fs` enforces canonical path validation and verifies that all resolved paths start with an authorized root. Symlink escapes are rejected.
3. **Secret Redaction**:
   Tracer redacts known token patterns and API keys before writing to `~/.fam/traces/`.

---

## 6. Prioritized Remediation Plan

- **P0**: Fix baseline failures:
  - Fix ESLint regex escape in `packages/core/src/router/rules.ts`.
  - Fix Vitest `ui.test.ts` `max_ctx` assertion.
  - Fix Rust Clippy warnings in `fam-fs` and `fam-sandbox`.
  - Run `cargo fmt --all`.
- **P1**: Harden agent state machine & execution pipeline in `AgentLoop`.
- **P2**: Refine permission gate in CLI to enforce Tier 2/3 boundaries in one-shot mode unless `--yes` is specified.
- **P3**: Validate universal file formats (SQLite, archives, office documents, source code).
- **P4**: Verify autonomous coding and terminal capabilities.
- **P5**: Implement and run the 10 Mandatory Real-World Acceptance Tasks against `qwen3.5:4b`.
- **P6**: Produce `docs/engineering/FINAL_REPORT.md`.

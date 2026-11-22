# PRD: Harness (working name: `hx`)

## 1. Summary
`hx` is a CLI AI agent harness for a single user on a laptop (Ryzen 7 7435HS, RTX 4050 6 GB VRAM, 24 GB RAM). It runs local models via Ollama plus Gemini via API, and extends them through MCP servers. It serves two purposes:
1. **Coding agent**: read, edit, test and commit code in a repo.
2. **Personal system assistant**: files, documents (docx/xlsx/pptx/pdf via LibreOffice and libraries), web, notes, reminders, media, system control.

## 2. Goals
- G1. Make small local models (≤8B) act well above their weight through harness engineering: tool retrieval, validation/repair, context management, and verification.
- G2. Cascade routing: cheap and local first, escalate to Gemini on failure, low confidence, or high complexity.
- G3. Multiple tool calling, parallel tool calling, and sequential multi-step execution, all robust.
- G4. MCP is the extension mechanism. Built-in capabilities are MCP servers; third-party MCP servers plug in with zero code.
- G5. Excellent document handling (read/create/edit/convert docx, xlsx, pptx, pdf, odt/ods) without dumping files into context.
- G6. Safe by default: permission tiers, sandboxing, backups, and approval for destructive actions.
- G7. Fully observable: every run is traced and replayable; an eval suite measures every change.
- G8. User-owned prompts: layered system prompt, editable, per-model variants.

## 3. Non-goals (v1)
- No GUI or web UI (CLI/TUI only). No multi-user or cloud hosting.
- No fine-tuning or training models.
- No voice I/O (later).
- No autonomous background operation without explicit user-created schedules.

## 4. Users and primary scenarios
Single power user, also a casual user for everyday tasks.
- "Fix the failing test in this repo." → coder loop with test feedback and git checkpoint.
- "Summarize this docx and put the action items in an xlsx." → office tools.
- "What's the total of column D in sales.xlsx grouped by region?" → spreadsheet→SQL path.
- "Remind me at 6pm to call mom." → system tools.
- "Find the cheapest option from these 3 pages." → web fetch in parallel, then synthesis.
- "Convert all .doc in this folder to .docx." → batch conversion via LibreOffice.

## 5. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-1 | Model adapter layer for Ollama and Gemini with one internal message/tool format and streaming | P0 |
| FR-2 | Agent loop with hard limits (steps, tokens, wall time) and loop/repetition detection | P0 |
| FR-3 | MCP client: stdio and streamable HTTP, tool discovery, `list_changed`, namespacing, lazy start | P0 |
| FR-4 | Tool registry with metadata: category, read-only/destructive flags, timeout, permission tier | P0 |
| FR-5 | Parallel executor: concurrent read-only calls, serialized side-effecting calls, per-tool timeouts, partial-failure handling | P0 |
| FR-6 | Argument validation against JSON Schema with specific repair feedback | P0 |
| FR-7 | Layered system prompt builder with per-model variants, token budgeting, `/system` inspection | P0 |
| FR-8 | Context manager: per-model budgets, explicit `num_ctx`, compaction, large-output offloading | P0 |
| FR-9 | Router (qwen2.5:1.5b on CPU) for intent classification and complexity scoring | P1 |
| FR-10 | Tool retrieval: embedding-based top-K selection plus a `find_tools` meta-tool | P1 |
| FR-11 | Permission system with tiers, approval prompts with previews, and an allow/deny policy file | P0 |
| FR-12 | Memory: working (todo/scratchpad), semantic (facts/preferences), episodic (task outcomes), retrieval per turn | P1 |
| FR-13 | Rust `fs` MCP server: read, list, grep, glob, edit (search/replace), repo map (tree-sitter), trash | P0 |
| FR-14 | Rust `sandbox` MCP server: shell/code execution with limits, no network by default | P1 |
| FR-15 | `office` MCP server: docx, xlsx, pptx, pdf read/create/edit, LibreOffice convert/recalc/render | P1 |
| FR-16 | Coding loop: coder-as-generator with search/replace blocks, apply, lint/test, feedback, retry, escalate; git checkpoints | P1 |
| FR-17 | Planner (Gemini): produce a DAG of steps; DAG executor runs independent nodes in parallel | P2 |
| FR-18 | Sub-agents / fan-out map-reduce | P2 |
| FR-19 | `web` MCP server: search, fetch→markdown, PDF fetch | P2 |
| FR-20 | `system` MCP server: clipboard, notifications, reminders/timers, app launch, system info, screenshot | P2 |
| FR-21 | Privacy routing: content and paths tagged local-only are never sent to Gemini without explicit consent | P0 |
| FR-22 | Tracing (JSONL) of prompts, responses, tool calls, timings, tokens; `hx replay` | P0 |
| FR-23 | Eval harness with ≥30 tasks, run per model, with a metrics report | P1 |
| FR-24 | Session persistence and resume; checkpoints | P1 |
| FR-25 | Expose the harness itself as an MCP server | P3 |

## 6. Non-functional requirements
- NFR-1 Local-first: works fully offline with local models (web tools excepted).
- NFR-2 Memory: never co-load two 7–8B models. The router runs on CPU.
- NFR-3 Latency: time-to-first-token < 3 s for a warm 8B model on a ≤4k prompt.
- NFR-4 Reliability: tool-call validity ≥ 95% after repair on the eval suite for the llama3.1:8b worker.
- NFR-5 Safety: no destructive operation without a tier-appropriate approval; all writes recoverable (backup, trash, or git).
- NFR-6 Portability: Windows and Linux (macOS best-effort). OS differences are isolated behind an interface.
- NFR-7 Startup: CLI is interactive in < 1 s. MCP servers start lazily.

## 7. Success metrics
- ≥ 80% pass on the 30-task eval suite with the cascade (local + Gemini).
- ≥ 60% of eval tasks completed with local models only.
- Zero eval cases where local-only data reaches Gemini.
- Office tasks: 100% of produced files open in LibreOffice without repair prompts.

## 8. Risks
| Risk | Mitigation |
|---|---|
| 6 GB VRAM limits context | Budgets, compaction, offloading, KV-cache quantization, Gemini for long-context work |
| Weak tool calling in small models | Tool retrieval, constrained output, validate/repair, coder-as-generator |
| Prompt injection via web, docs, MCP | Untrusted-data labeling, permission tiers, approvals, project-prompt hash approval |
| Oversized reference system prompt | Distillation into tiered prompts with token budgets (Phase 0) |
| Gemini free-tier limits and privacy | Rate limiter, backoff, privacy routing |
| Scope creep | Phase gates in plan.md; P2/P3 items deferred |

## 9. Open questions (agent must resolve in Phase 0 and record in PROGRESS.md)
- Host OS and shell. Ollama version. Is LibreOffice installed? Which Gemini model name is available for the key?

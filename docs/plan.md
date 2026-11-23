# Plan

## 1. Strategy
Build a thin vertical slice first (Phase 1), then add layers. Start tracing and evals early. Every phase ends with a runnable demo and a gate.

## 2. Lanes (for parallel agents)
| Lane | Scope | Files |
|---|---|---|
| **A: Core** | TS core, adapters, loop, context, router, memory | `packages/core`, `packages/shared` |
| **B: Rust** | fs, sandbox (and system if Rust) servers | `servers/fs`, `servers/sandbox`, `servers/system` |
| **C: Office/Web** | TS MCP servers | `servers/office`, `servers/web` |
| **D: CLI/DX** | TUI, commands, doctor, packaging | `packages/cli` |
| **E: Prompts/Evals** | prompt analysis and distillation, eval suite | `prompts/`, `packages/evals`, `docs/reference` |
| **F: MCP host** | `packages/mcp-host` | (usually lane A, can be split) |

Lanes interact only through the contracts in `packages/shared` and MCP schemas. Freeze the contracts in Phase 0.

## 3. Phases

### Phase 0: Foundations and prompt analysis
**Goal**: repo skeleton, toolchain, frozen contracts, environment facts, and distilled prompts.
- Monorepo (pnpm + cargo), lint/format/test/CI scripts.
- `packages/shared`: Message/ToolCall/ToolDescriptor/ModelAdapter/Config types (zod).
- `fam doctor` skeleton: detect OS, Ollama, pulled models, GPU/VRAM (`nvidia-smi`), soffice, git, API key.
- **Prompt analysis (lane E)**: analyze `docs/reference/prompt.md`, then produce the tiered prompts.
- **Exit gate**: `pnpm build && pnpm test && cargo build` pass. `fam doctor` prints a full environment report, which is recorded in PROGRESS.md. `prompt-analysis.md` and the 5 prompt files exist within token budgets.

### Phase 1: Adapters, loop, CLI MVP (vertical slice)
**Goal**: chat with any of the 4 models in the terminal with streaming, one built-in echo/time tool, and traces.
- Ollama and Gemini adapters, capability probing, token counting calibration.
- Prompt builder (layers, budgets, `/system`).
- Agent loop with limits and loop detection (single tool calls).
- Ratatui Rust TUI: native frontend (`crates/fam-tui`), IPC bridge, streaming, status bar, slash basics.
- Tracer (JSONL).
- Benchmark script: measure VRAM, tokens/s, max stable `num_ctx` for each model, then write `models.toml`.
- Probe: does qwen2.5-coder:7b support Ollama native tool calls? Record the result and set `caps.tools`.
- **Exit gate**: demo p1: converses with each model, tool call round-trips on llama3.1 and Gemini, trace file produced, `models.toml` populated from measurements.

### Phase 2: MCP host and the `fs` server
**Goal**: real tools via MCP.
- MCP host (stdio, then streamable HTTP), registry bridge, namespacing, aliasing, `list_changed`, lazy start, reconnect.
- Rust `fs` server with all tools in architecture 4.11 (repo_map via tree-sitter for TS/JS/Py/Rust/Go at minimum).
- `fam mcp list/add/test`. First-connect approval for third-party servers.
- **Exit gate**: agent can "find all TODOs in this repo and summarize by file" using `fs` over MCP with llama3.1. A third-party MCP server (e.g. the reference filesystem or fetch server) connects through config alone.

### Phase 3: Executor, permissions, approvals
**Goal**: safe parallel multi-tool execution.
- Validator/repair (ajv), parallel scheduler (read-only concurrency, write serialization, path conflicts), timeouts, partial failures.
- Permission tiers, policy file, approval modal, session "always" grants, dry-run previews, undo (backups).
- Privacy gate v1 (path globs and secret detectors).
- Tracing completed (permission/route events). `fam replay`.
- **Exit gate**: concurrency tests prove reads run in parallel and writes serialize. A malformed call is repaired in ≤ 2 rounds in a recorded test. A tier-2 action blocks until approved. Secret in a file never reaches the Gemini adapter (test with a mock).

### Phase 4: Context manager
**Goal**: stable behavior inside 8k.
- Token budgeter, blob offloading with `blob_read`/`blob_grep`, tool-result stubbing, compaction via qwen2.5:1.5b (CPU), hard-truncate fallback, KV-prefix stability test.
- `/context`, `/compact`.
- **Exit gate**: a 60-turn scripted conversation with large tool outputs stays under `num_ctx` with zero silent truncation, and key facts survive compaction (assert via a fact-recall test).

### Phase 5: Router and tool retrieval
**Goal**: send each request to the right model with the right 5–8 tools.
- Router (rules fast path + 1.5b JSON classification), routing policy file.
- Tool embeddings (`nomic-embed-text`), top-K retrieval, `find_tools`, sticky and core sets, description shortening for small models.
- Model scheduler/lock with batching by model.
- **Exit gate**: with ≥ 40 registered tools, llama3.1 correct-tool selection ≥ 85% on a 40-prompt eval set. Router latency < 800 ms on CPU. Local VRAM swaps are minimized in a mixed-task test.

### Phase 6: Memory
**Goal**: implement memory.md part A.
- SQLite schema, embeddings, write/read paths, dedup/supersede, extraction at session end, working-memory tools (todo/scratch), session persistence and `fam resume`, `/memory`.
- **Exit gate**: the memory acceptance tests in memory.md section 9 pass.

### Phase 7: Office server
**Goal**: document superpowers (lane C, parallelizable once Phase 2 is done; may start right after Phase 2).
- Read tools (docx/xlsx/pptx/pdf) returning bounded views; `xlsx_describe`, `xlsx_read_range`, `xlsx_query_sql`.
- Write/create tools; backup and verify-by-reopen; LibreOffice `convert`, `recalc`, `render_preview`; a soffice process manager with an isolated profile.
- Office eval cases (≥ 10).
- **Exit gate**: all office eval cases pass with Gemini, and ≥ 6/10 with local models only. Every output file opens in LibreOffice without a repair prompt (automated check by headless conversion).

### Phase 8: Sandbox and the coding loop
**Goal**: reliable coding agent.
- Rust `sandbox` server (limits, workspace-scoped FS, no network by default; OS-specific isolation behind a trait).
- Coding loop per architecture 4.8: git checkpoint, search/replace generation by coder, fuzzy apply, lint/test feedback, retry, escalate. Test/lint command detection.
- `/undo`, `/diff`. Role `coder`.
- Coding eval cases (≥ 10: bugfix, add feature, refactor, write tests).
- **Exit gate**: ≥ 6/10 coding evals pass local-only, ≥ 9/10 with escalation. Every change is revertible with `/undo`.

### Phase 9: Planner, escalation, sub-agents
**Goal**: handle complex tasks and cascade properly.
- Gemini planner producing a DAG, DAG executor, result handles, escalation ladder with compacted state, verifier hooks, fan-out map-reduce, sub-agent with a restricted tool subset and budget.
- **Exit gate**: a multi-file, multi-step eval (e.g. "read 5 docs in parallel, build a summary xlsx, and verify") completes. Escalation traces show the correct ladder. Privacy gate holds at every hop.

### Phase 10: Web and system tools
- `web` server (search via a configurable provider, e.g. SearXNG or API, `fetch_markdown` with readability extraction, `fetch_many`, PDF fetch).
- `system` server (clipboard, notify, reminders/timers with a persistent scheduler, open_app, sysinfo, screenshot), OS-abstracted.
- Extra everyday servers as config presets: git, ffmpeg wrapper, calendar/email (third-party MCP).
- **Exit gate**: everyday-tasks eval group passes (≥ 8 tasks).

### Phase 11: Evals, hardening, packaging
- Full eval suite (≥ 30 tasks across coding/office/web/system/memory/privacy), per-model report, regression baselines.
- Fuzz tool-arg validation, injection test pack (malicious web page/doc/MCP description), chaos tests (server crash, Ollama down, rate-limit).
- `fam serve` (harness as an MCP server), packaging (single install script, config wizard), user docs/README, prompt tuning pass per tier.
- **Exit gate**: the PRD success metrics section 7 are met or gaps documented with a plan.

## 4. Dependency graph
```
P0 → P1 → P2 → P3 → P4 → P5 → P6
              ├──────────→ P7 (after P2; needs P3 for approvals at final integration)
              └→ P8 (after P3, P4)
P5 + P6 + P8 → P9 → P11
P2 → P10 (after P3) → P11
```

## 5. Parallelization guidance
- After P0: A (P1 core) ∥ D (CLI shell) ∥ E (prompt distillation, eval scaffold) ∥ B (start the Rust `fs` skeleton against the frozen MCP tool schemas).
- After P2: C (office) ∥ A (P3/P4) ∥ B (sandbox).
- Merge points are phase exit gates. One agent integrates and runs the gate.

## 6. Risk checkpoints
- End of P1: if the llama3.1:8b tool-calling reliability is poor, bring the Phase 5 retrieval and constrained-output work forward.
- End of P4: if 8k is unstable on 6 GB, reduce to 6k and shift more work to Gemini.
- End of P7: if the libraries can't do a needed docx/xlsx operation, add a LibreOffice UNO-script fallback tool.

# Development Progress Log

## 2026-11-22 lead-architect Phase 6 Exit Gate Verification: Memory System, Vector Store, Working Memory, Persistence (status: done)
- **What changed**:
  - Implemented SQLite Database & Migrations (`packages/core/src/memory/db.ts`):
    - Persistent SQLite database at `~/.harness/db/memory.sqlite` with migration versioning.
    - Full schema implementation per `memory.md` §3: `memory`, `sessions`, and virtual vector tables.
    - Native `sqlite-vec` extension support (`vec0` virtual table) with automatic pure-JS Float32Array blob + cosine fallback.
  - Implemented `MemoryService` (`packages/core/src/memory/service.ts`):
    - Project scope hashing: `project:<hash>` derived from working directory SHA-256.
    - Write path (`remember`):
      - Automatic privacy gate checks marking credentials and keys as `local_only`.
      - Text embedding via `EmbeddingService`.
      - Near-duplicate detection: bumps `use_count` and updates recency on equivalent statements.
      - Contradiction & update handling: sets `superseded_by` on outdated memories and stores replacement.
    - Read path (`retrieve`):
      - Vector similarity retrieval across active non-superseded memories in scope (global + project).
      - Multi-factor ranking: `0.6 * similarity + 0.2 * recency (30d half-life decay) + 0.2 * importance`.
      - Relevance cutoff: drops scores < 0.35.
      - Strict 400-token budget cap for dynamic prompt layer injection.
      - Non-negotiable privacy guarantee: `local_only` memories are completely purged from prompts sent to Gemini API.
    - Prompt formatting: renders clean `## Relevant memory` bullet lists for Layer 6 dynamic context.
  - Implemented Working Memory Subsystem (`packages/core/src/memory/working.ts`):
    - `TodoManager`: manages task checklist (`add`, `done`, `list`, `clear`), formatted for prompt Layer 6.
    - `Scratchpad`: key-value scratchpad (`set`, `get`, `append`) bounded to strict 2 KB capacity limit.
    - `SessionPersistence`: persists session state (`todos`, `scratch`, `summary`, `messages`) to `~/.harness/sessions/<id>.json`.
    - `history_search`: searches past session transcripts for past decisions and context.
  - Implemented Memory Extraction (`packages/core/src/memory/extractor.ts`):
    - Small model extraction on CPU (`qwen2.5:1.5b`) extracting <= 5 candidate memories at session end or on `/compact`.
  - Implemented Built-in Memory Tools (`packages/core/src/memory/tools.ts`):
    - `core.remember`, `core.todo`, `core.scratch`, `core.history_search` descriptors and handlers.
  - Implemented CLI & UI Memory Commands:
    - CLI commands: `hx memory list`, `hx memory search <query>`, `hx memory forget <id>`, `hx memory wipe`.
    - TUI slash commands: `/memory list|search|forget|export|import|wipe`.
  - Authored comprehensive test suite:
    - `packages/core/src/__tests__/memory.test.ts`: 13 test cases verifying SQLite migrations, write dedup/supersede, read scoring, 400-token cap, privacy isolation, working memory, and user controls.
  - Authored and verified automated Phase 6 Exit Gate (`scripts/demo-p6.ts`, `scripts/demo-p6.sh`):
    - Session 1 preference ("Always format dates in ISO 8601") retrieved in Session 2.
    - Contradicting preference ("format dates as DD/MM/YYYY") successfully superseded old memory.
    - 400-token budget cap strictly enforced (29 tokens, 6ms latency < 150ms).
    - `local_only` sensitive memory purged from Gemini request and preserved for local Ollama.
    - Todo checklist and 2 KB bounded scratchpad verified.
    - Session persistence and history search verified.
    - Memory export, wipe, and import verified.
- **Phase 6 Exit Gate Verdict**:
  - **ALL PHASE 6 ACCEPTANCE CRITERIA SATISFIED**. Phase 6 is formally COMPLETE and LOCKED.
- **Tests run + results**:
  - Full monorepo Vitest: 36/36 test files passed, 158/158 tests passed cleanly (1 skipped).
  - TypeScript build: 5/5 packages compiled cleanly with zero errors.
  - `scripts/demo-p6.sh`: exit code 0.
- **Open issues / next step**:
  - Phase 7: Office Server (Tasks T7.1–T7.10).


## 2026-11-22 lead-architect Phase 5 Exit Gate Verification: Router, Routing Policy, Tool Embeddings, Vector Retrieval, Scheduler (status: done)
- **What changed**:
  - Implemented Rules Fast Path & Complexity Estimator (`packages/core/src/router/rules.ts`):
    - Sub-millisecond keyword and regex fast-path classification for coding, office, web, system, and general intents.
    - Sensitivity fast-path detection marking queries with credentials, API keys, or `.env` paths as `local_only`.
    - Heuristic complexity estimator (1–5 scale) based on scope, multi-step actions, and architectural patterns.
  - Implemented 1.5B LLM Router (`packages/core/src/router/llm.ts`):
    - Pinned to CPU (`num_gpu: 0`) using `qwen2.5:1.5b` with strict JSON schema output formatting.
    - Robust parsing and fallback classification on network failure or model timeout.
  - Implemented Routing Policy Loader & Model Chain Resolver (`packages/core/src/router/policy.ts`):
    - Built-in default policy and TOML file loader (`config/routing.toml`, `~/.harness/routing.toml`).
    - Maps (intent, complexity, privacy) to optimized model chains.
    - Enforced non-negotiable privacy guarantee: `local_only` prompts strictly purge all cloud/Gemini models.
    - Throws `PrivacyBlocked` if user attempts to override with a cloud model on a `local_only` prompt.
  - Implemented `Router` orchestrator (`packages/core/src/router/index.ts`):
    - Fast path rules -> 1.5B LLM router -> Policy chain resolver -> emits `route` trace events.
  - Implemented `EmbeddingService` (`packages/core/src/tools/embedding.ts`):
    - Ollama `nomic-embed-text` vector embedding generation.
    - On-disk persistent embedding cache at `~/.harness/cache/tool_embeddings.json`.
    - SHA-256 tool signature invalidation based on name, descriptions, and inputSchema.
    - JS cosine similarity calculation fallback.
  - Implemented `ToolRetriever` (`packages/core/src/tools/retriever.ts`):
    - Top-K cosine similarity tool retrieval (default K=6).
    - Category score boosting (+0.2) when tool category matches routing context.
    - Core tool set preservation (`core.find_tools`, `core.blob_read`, `core.todo`, `core.remember`).
    - Sticky tool set retention preserving recently invoked tools across turns.
    - Description shortening for small models (Task T5.5), measuring and reporting token savings.
  - Implemented `find_tools` Meta-Tool (`packages/core/src/tools/meta/find-tools.ts`):
    - Discovers matching tools dynamically mid-run and activates them into sticky session context (Task T5.4).
  - Implemented `ModelScheduler` (`packages/core/src/models/scheduler.ts`):
    - Enforced hardware profile constraints (AMD Ryzen 7 7435HS + RTX 4050, 6 GB VRAM).
    - GPU execution mutex serializing local model runs.
    - GPU model swap minimization: tracks loaded GPU model, and when swapping (e.g. `llama3.1:8b` <-> `qwen2.5-coder:7b`), sends Ollama unload request (`keep_alive: 0`) and tracks swap count.
    - Cloud models (Gemini API) bypass local GPU locks completely and execute concurrently.
  - Authored comprehensive test suites:
    - `packages/core/src/__tests__/router.test.ts`: 50-prompt labeled dataset testing intent accuracy >= 90% and CPU latency < 800ms; full policy and privacy rule tests.
    - `packages/core/src/__tests__/tool-retriever.test.ts`: embeddings caching, invalidation, retrieval@6, category boost, core & sticky sets, description shortening token savings, and `find_tools` hot-swap.
    - `packages/core/src/__tests__/scheduler.test.ts`: GPU swap tracking, unload calls on model change, Gemini bypass.
    - `packages/core/src/__tests__/tool-selection-eval.test.ts`: evaluated 40 prompts against 45 registered tools, achieving 100.0% tool selection accuracy (threshold >= 85%).
  - Authored and verified automated Phase 5 Exit Gate (`scripts/demo-p5.ts`, `scripts/demo-p5.sh`):
    - 50-prompt dataset: 96.0% intent accuracy, 100% privacy accuracy, 101.02 ms average latency (< 800 ms).
    - Policy loader: verified local_only cloud model purging and `PrivacyBlocked` on cloud override.
    - 40-prompt tool selection: 100.0% accuracy across 45 registered tools.
    - Description shortening: 509 tokens saved for small model context.
    - `find_tools`: dynamically discovered and hot-swapped `fs.trash` into active context.
    - ModelScheduler: verified mixed-task execution with exactly 2 GPU swaps and Gemini bypass.
- **Phase 5 Exit Gate Verdict**:
  - **ALL PHASE 5 ACCEPTANCE CRITERIA SATISFIED**. Phase 5 is formally COMPLETE and LOCKED.
- **Tests run + results**:
  - Full monorepo Vitest: 35/35 test files passed, 145/145 tests passed cleanly (1 skipped).
  - TypeScript build: 5/5 packages compiled cleanly with zero errors.
  - `scripts/demo-p5.sh`: exit code 0.
- **Open issues / next step**:
  - Phase 6: Memory and Persistence (Tasks T6.1–T6.8).


## 2026-11-22 lead-architect Phase 4 Exit Gate Verification: Context Manager, Blob Store, Stubbing, Compaction & Soak Test (status: done)
- **What changed**:
  - Implemented `TokenBudgeter` (`packages/core/src/context/budget.ts`):
    - Strict per-model budget allocations (`numCtx`, `system`, `tools`, `history`, `reserve`).
    - Granular token accounting across system prefix, tool descriptors, conversation history, and reserve headroom.
    - Pre-send validation guaranteeing `prompt + reserve <= num_ctx`.
  - Implemented `BlobStore` & Large Result Offloading (`packages/core/src/context/blobs.ts`):
    - Persistent content-addressed blob store at `~/.harness/blobs/<sha256>`.
    - Automated offloading of tool outputs exceeding threshold (default 2,000 chars).
    - Compact surrogate summaries with first/last preview lines, byte size, line count, and SHA handle.
    - Built-in retrieval tools: `blob_read(handle, offset?, limit?)` and `blob_grep(handle, pattern, ignore_case?)`.
  - Implemented `ToolResultStubber` (`packages/core/src/context/stubbing.ts`):
    - Gracefully compresses older tool results to one-line summaries (`[Result from <tool>: <summary>]`) when context pressure increases.
    - Strictly preserves the most recent N tool turns untouched.
  - Implemented `TurnCompactor` (`packages/core/src/context/compactor.ts`):
    - Multi-turn compression using small model (`qwen2.5:1.5b` or rule-based fallback).
    - Extracts structured facts, user decisions, modified file paths, and open tasks into an executive summary block.
    - Keeps the most recent 4 turns completely intact.
  - Implemented `EmergencyTruncator` (`packages/core/src/context/truncation.ts`):
    - Last-resort fallback trimming oldest non-system, non-latest user turns if soft compaction does not fit within budget.
  - Implemented `ContextManager` orchestrator (`packages/core/src/context/manager.ts`):
    - Implemented 4-phase ladder: (1) Blob offloading -> (2) Tool result stubbing -> (3) Rolling turn compaction -> (4) Emergency truncation.
    - Integrated directly into `AgentLoop` in `packages/core/src/loop/index.ts`.
  - Implemented CLI Context Commands in `packages/cli/src/ui/App.tsx`:
    - `/context`: displays component token accounting breakdown table and utilization status.
    - `/compact`: triggers manual conversation history compaction.
    - `/undo`: restores pre-write backups from `BackupService`.
  - Authored comprehensive test suite:
    - `packages/core/src/__tests__/context.test.ts`: budget enforcement, blob read/grep, stubbing idempotence.
    - `packages/core/src/__tests__/kv-prefix.test.ts`: verified byte-identical stable prefix across dynamic context changes, and prompt eval cache reuse in Ollama.
    - `packages/core/src/__tests__/soak.test.ts`: ran 60 consecutive turns through `AgentLoop` + `ContextManager` without exceeding 8192 context or corrupting conversation state.
  - Authored and verified automated Phase 4 Exit Gate (`scripts/demo-p4.ts`, `scripts/demo-p4.sh`):
    - Handled 50,552 chars of tool output across multi-turn execution.
    - Verified automatic blob offload to disk and retrieval via `blob_read` and `blob_grep`.
    - Verified dynamic context compression down to 4,925 / 8,192 tokens.
    - Verified byte-identical stable prefix across runs.
    - Verified live Ollama prompt evaluation in 134ms.
- **Phase 4 Exit Gate Verdict**:
  - **ALL PHASE 4 ACCEPTANCE CRITERIA SATISFIED**. Phase 4 is formally COMPLETE and LOCKED.
- **Tests run + results**:
  - Full monorepo Vitest: 30/30 test files passed, 121/121 tests passed cleanly (1 skipped).
  - TypeScript build: 5/5 packages compiled cleanly with zero errors.
  - `scripts/demo-p4.sh`: exit code 0.
- **Open issues / next step**:
  - Phase 5: Router and Tool Retrieval (Tasks T5.1–T5.6).


## 2026-11-22 lead-architect Phase 3 Exit Gate Verification: Executor, Permissions, Approvals, Backups, Privacy, Evals (status: done)
- **What changed**:
  - Implemented `ToolValidator` (`packages/core/src/tools/validator.ts`):
    - AJV schema validation with type coercion (`"true"`/`"false"` -> boolean, numeric strings -> numbers).
    - Common model hallucination repair (`file`/`filename`/`dir` -> `path`, `regex`/`query` -> `pattern`).
    - Actionable formatted error feedback with expected valid schemas.
  - Implemented `ToolExecutor` (`packages/core/src/tools/executor.ts`):
    - Concurrent parallel batching for read-only tools (concurrency limit = 8).
    - Strictly serialized execution for mutating write tools with path-conflict detection.
    - Per-tool timeout and cancellation via `AbortController`, partial failure isolation without crashing batch.
    - Integrated directly into `AgentLoop` (`packages/core/src/loop/index.ts`).
  - Implemented `PermissionGate` (`packages/core/src/tools/permission.ts`):
    - Enforced Tiers 0-4 per Design §4 (Tier 0 read-only auto, Tier 1 workspace write auto with backup, Tier 2 external/destructive ask, Tier 3 shell ask, Tier 4 typed confirmation).
    - Policy allow/deny globs, command-prefix allowlists (`git status`, `git diff`, `pnpm test`), and session grants.
  - Implemented `ApprovalModal` UI (`packages/cli/src/ui/components/ApprovalModal.tsx`):
    - Visual risk badge with color coding, path/command/diff previews, and interactive keys (`y`, `a`, `n`, `e`, `?`).
    - Enforced typed `"CONFIRM"` requirement for Tier 4 destructive actions.
  - Implemented `BackupService` (`packages/core/src/backup/index.ts`):
    - Pre-write snapshotting to `~/.harness/backups/<changeSetId>/` with SHA-256 hashes and change manifests.
    - `/undo` command restoring modified files and deleting newly created files byte-for-byte.
  - Implemented `PrivacyGate` (`packages/core/src/privacy/index.ts`):
    - Path glob detection for local-only files (`.env*`, `secrets/**`, `*.pem`, `*.key`, `.git/**`).
    - Sensitive token regex matching (Google API keys, OpenAI keys, GitHub PATs, basic auth).
    - Shannon entropy calculation (> 4.5 bit threshold) detecting random keys.
    - Taint propagation from tool results into session state.
    - Fail-closed enforcement on `GeminiAdapter`, blocking tainted payloads before transmission.
  - Implemented observability trace tools in `packages/cli/src/bin/hx.ts`:
    - `hx replay <run>`: renders step-by-step trace event playback.
    - `hx trace stats <run>`: computes token consumption, step counts, latencies, and tool-use frequencies.
  - Implemented `@hx/evals` package:
    - YAML task schema, loader, and 5 initial smoke eval tasks (`task_01` to `task_05`).
    - `EvalRunner` and `EvalReporter` generating JSON and Markdown scoreboards.
    - Added `hx eval [--suite] [--model] [--task]` command to CLI.
  - Authored and verified automated Phase 3 Exit Gate (`scripts/demo-p3.ts`, `scripts/demo-p3.sh`):
    - 4 parallel reads (100ms each) finished in 119ms (< 300ms concurrent timing proof).
    - 3 writes finished in 181ms in strict sequential order `[1, 2, 3]`.
    - Malformed arguments repaired and coerced into schema compliance.
    - Tier 2 action blocked until approved, and allowed once approved.
    - Backup service restored corrupted file to original state.
    - Privacy gate blocked tainted transmission to Gemini adapter.
    - Eval framework ran smoke tasks with score reports.
- **Phase 3 Exit Gate Verdict**:
  - **ALL PHASE 3 ACCEPTANCE CRITERIA SATISFIED**. Phase 3 is formally COMPLETE and LOCKED.
- **Tests run + results**:
  - Full monorepo Vitest: 28/28 test files passed, 112/112 tests passed cleanly (1 skipped).
  - TypeScript build: 5/5 packages compiled cleanly with zero errors.
  - `scripts/demo-p3.sh`: exit code 0.
- **Open issues / next step**:
  - Phase 4: Context Manager (Tasks T4.1–T4.6).
- **What changed**:
  - Implemented high-performance native Rust filesystem MCP server in `servers/fs/`:
    - Confinement engine (`confinement.rs`): strict canonicalization and root confinement; rejects symlink escapes and directory traversal outside the active workspace.
    - Inspection & reading tools (`tools/read.rs`): `read_file` (1-indexed bounded ranges, binary check, truncation flags), `list_dir` (recursive directory walker with file types and sizes), `file_info` (file stats, permissions, timestamps, line counts).
    - Search tools (`tools/search.rs`): `glob` and `grep` with gitignore awareness via `ignore::WalkBuilder`, regex parsing, context lines, match limits, and truncation indicators.
    - Modification tools (`tools/edit.rs`): `write_file` (creates parent directories), `apply_edit` (search/replace blocks with whitespace-tolerant fuzzy matching, CRLF/LF normalization, and ambiguity detection), `move`, and OS-level `trash` (via `trash` crate).
    - Repository structure map (`tools/repo_map.rs`): tree-sitter AST extraction for Rust, TypeScript/JavaScript, and Python, outputting concise symbol outlines ranked by file path.
    - Fast JSON-RPC 2.0 stdio server loop (`server.rs`, `main.rs`) with automated argument coercion (converting stringified `"true"`, `"false"`, and numbers).
  - Implemented CLI MCP management in `packages/cli/src/mcp/` and `hx mcp`:
    - `hx mcp list`: table and JSON formats for configured servers.
    - `hx mcp test <name>`: tests connection, queries tool definitions, and measures round-trip latency.
    - `hx mcp add <name>` / `hx mcp remove <name>`: manages `~/.harness/servers.toml`.
  - Executed automated Phase 2 Exit Gate in `scripts/demo-p2.ts` (`scripts/demo-p2.sh`):
    - Configured multi-server MCP host (`fs` via native binary, `third_party_fixture` via config alone).
    - Verified discovery of 15 tools across servers.
    - Ran `AgentLoop` with `llama3.1:8b` asking to find all TODOs in the codebase using `fs_grep`.
    - `llama3.1:8b` invoked `fs_grep`, self-repaired argument types, retrieved 31 matches, and produced a clear multi-file summary.
    - Recorded 12 trace events to disk and shut down cleanly.
- **Phase 2 Exit Gate Verdict**:
  - **ALL PHASE 2 ACCEPTANCE CRITERIA SATISFIED**. Phase 2 is formally COMPLETE and LOCKED.
- **Tests run + results**:
  - `cargo test --package hx-fs`: 9/9 tests passed cleanly.
  - `pnpm run ci`: 23/23 test files, 86/86 tests passed cleanly.
  - `scripts/demo-p2.sh`: exit code 0.
- **Open issues / next step**:
  - Phase 3: Executor, Permissions, Approvals (Tasks T3.1–T3.8).

## 2026-11-22 lead-architect Tasks T2.1, T2.2, T2.3 MCP Host & Registry Bridge (status: done)
- **What changed**:
  - Implemented `McpConnection` in `packages/mcp-host/src/connection.ts`:
    - Official `@modelcontextprotocol/sdk` integration with both `StdioClientTransport` and `SSEClientTransport`.
    - Lifecycle management: lazy connection on first tool invocation, graceful disconnection, and automatic reconnection with exponential backoff on unexpected process/socket drop.
    - Real-time `notifications/tools/list_changed` listener using `ToolListChangedNotificationSchema` to dynamically refresh tool registries.
    - Environment variable expansion (`${VAR}` and `$VAR`) for transport headers (e.g. Bearer auth) and connection URLs.
  - Implemented `McpRegistryBridge` in `packages/mcp-host/src/registry.ts`:
    - Strict namespacing `<server>.<tool>` and small-model safe alias sanitization `[a-zA-Z0-9_]{1,64}`.
    - Disambiguation suffixing on alias collisions (e.g. `srv_sub_tool_2`).
    - Tool tier resolution (read-only -> Tier 0, destructive -> Tier 2, general -> Tier 1).
    - `tools.toml` overrides support for customizing `tier`, `timeoutMs`, `category`, and `description`.
    - `getModelDescriptors(useAliasAsName)` method allowing small models to receive dots-free aliases as function names.
  - Implemented `McpHost` in `packages/mcp-host/src/host.ts`:
    - Multi-server manager loading configs (`stdio` and `http`).
    - Lazy server start with transparent on-demand tool execution and routing.
  - Added full test suite (16 tests across 4 suites) in `packages/mcp-host/src/__tests__/`:
    - `stdio-host.test.ts`: verified lazy launch, tool execution (`add`, `echo`), error handling against stdio fixture.
    - `http-host.test.ts`: verified HTTP/SSE transport with authorized Bearer tokens via env expansion.
    - `registry.test.ts`: verified namespacing, alias collisions, and tool overrides.
- **Decisions made**:
  - Used official `@modelcontextprotocol/sdk` v1.32.2 for rock-solid protocol compliance.
- **Tests run + results**:
  - `pnpm test` and `pnpm run ci` passed cleanly (21/21 test files, 78/78 tests passing).
- **Open issues / next step**:
  - Next task: T2.4 Rust `fs` server skeleton in Lane B (`servers/fs`).

## 2026-11-22 lead-architect Phase 1 Exit Gate Verification (status: done)
- **What changed**:
  - Authored automated Phase 1 exit gate verification in `scripts/demo-p1.ts` and runner `scripts/demo-p1.sh`.
  - Executed end-to-end vertical slice gate validation across all criteria in `plan.md` Section 3 (Phase 1):
    1. Conversed with CPU model `qwen2.5:1.5b` (`placement = "cpu"`, `num_gpu = 0`) with live streaming response.
    2. Conversed with Coder model `qwen2.5-coder:7b` generating syntactically valid TypeScript function.
    3. Successfully performed tool-call round-trip on local GPU model `llama3.1:8b` (built-in `echo` tool invoked with arguments, executed, and result fed back to model for turn completion).
    4. Verified structured trace recording: validated that `Tracer` wrote 8 events (`session_start`, `prompt`, `model_call`, `tool_call`, `tool_result`, `session_end`) to disk at `~/.harness/traces/gate_p1_<timestamp>/demo_run.jsonl`.
    5. Verified Gemini model adapter with comprehensive mocked test suite (and conditional live test when `GEMINI_API_KEY` is present).
    6. Verified `config/models.toml` matches measured capabilities and benchmarks.
- **Phase 1 Exit Gate Verdict**:
  - **ALL PHASE 1 ACCEPTANCE CRITERIA SATISFIED**. Phase 1 is formally COMPLETE and LOCKED.
- **Tests run + results**:
  - `scripts/demo-p1.sh` passed with exit code 0.
  - `pnpm run ci` passed cleanly (18/18 test files, 69/69 tests passing, eslint clean, tsc -b clean, cargo check clean).
- **Open issues / next step**:
  - Phase 2: MCP Host and `fs` Server (Tasks T2.1–T2.6).

## 2026-11-22 lead-architect Task T1.8 Local Model Benchmark Results (status: done)
- **What changed**:
  - Implemented automated benchmarking script in `scripts/bench-models.ts` (`pnpm bench:models`):
    - Measures clean cold load duration after explicit `/api/generate` unload (`keep_alive: 0`).
    - Evaluates generation tokens/sec and prompt evaluation tokens/sec across context sizes (4096 and 8192).
    - Queries `nvidia-smi` and Ollama `/api/ps` to track exact VRAM allocations (`size_vram` vs `size`) and detect CPU layer spills.
  - Executed benchmark on local NVIDIA RTX 4050 Laptop GPU (6GB VRAM, AMD Ryzen 7 7435HS):
    | Model | Placement | Context (`num_ctx`) | Cold Load | Generation (t/s) | Prompt Eval (t/s) | VRAM Used | CPU Spill | Status |
    |---|---|---|---|---|---|---|---|---|
    | `qwen2.5:1.5b` | CPU | 4096 | 1.30s | 36.8 t/s | 360.8 t/s | 0 MB | No (100% CPU) | PASS |
    | `llama3.1:8b` | GPU | 4096 | 3.58s | 20.2 t/s | 114.9 t/s | 3913 MB | ⚠️ Partial (27/33 layers on GPU) | PASS |
    | `llama3.1:8b` | GPU | 8192 | 3.12s | 18.4 t/s | 99.7 t/s | 4011 MB | ⚠️ Partial (27/33 layers on GPU) | PASS |
    | `qwen2.5-coder:7b` | GPU | 4096 | 3.58s | 26.2 t/s | 356.5 t/s | 4005 MB | ⚠️ Partial (26/28 layers on GPU) | PASS |
    | `qwen2.5-coder:7b` | GPU | 8192 | 2.50s | 24.3 t/s | 310.4 t/s | 4073 MB | ⚠️ Partial (26/28 layers on GPU) | PASS |
- **Decisions made & Hardware Insights**:
  - With ~700MB host system display VRAM allocated out of 6141MB total, ~5.4GB is available for Ollama.
  - At 8192 context, both 8B/7B models use ~4.0GB VRAM on GPU while placing a few top layers into system RAM (24GB total RAM available), yielding stable, smooth execution (18.4–24.3 t/s) with zero out-of-memory errors.
  - CPU router `qwen2.5:1.5b` executes at a very fast 36.8 t/s generation and 360.8 t/s prompt evaluation without using any GPU VRAM.
  - Verified `config/models.toml` parameters match the measured capabilities and stable context limits.
- **Tests run + results**:
  - `pnpm bench:models` completed cleanly with all test runs passing.
- **Open issues / next step**:
  - Next task: T1.9 Phase 1 Exit Gate demo (`scripts/demo-p1.sh`).

## 2026-11-22 lead-architect Task T1.7 Ink CLI MVP Implementation (status: done)
- **What changed**:
  - Implemented the full terminal user interface in `packages/cli/src/ui/`:
    - `StatusBar.tsx`: renders model name, active context usage vs max context, tier (`full|medium|min`), generation speed (`tok/s`), placement badge (`LOCAL|CLOUD`), and current working directory.
    - `MessageView.tsx`: renders formatted message scrollback for user inputs, assistant outputs (with live streaming cursor `▌`), and system notifications.
    - `ToolCallView.tsx`: renders collapsible tool call indicators with real-time `ink-spinner` while running, success gear `⚙` or failure cross `✖`, execution duration in milliseconds, and argument/result summaries.
    - `adapter-factory.ts`: handles model adapter instantiations (`OllamaAdapter` / `GeminiAdapter`) respecting placement and `--local-only` privacy restrictions.
    - `App.tsx`: main interactive Ink terminal application integrating streaming turns, keyboard navigation (Esc to cancel generation), and built-in slash command handlers (`/help`, `/system`, `/model <name>`, `/models`, `/role <role>`, `/clear`, `/exit`).
  - Updated CLI runner in `packages/cli/src/bin/hx.ts`:
    - Full Commander CLI options: `--model`, `--role`, `--system`, `--append-system`, `--system-file`, and `--local-only`.
    - Supports both interactive multi-turn session mode and one-shot non-interactive prompt execution.
  - Added unit test suite in `packages/cli/src/__tests__/ui.test.tsx` (8 tests passing) using `ink-testing-library`.
- **Decisions made**:
  - Configured TSX support with `jsx: "react-jsx"` in `@hx/cli` to keep other packages clean.
- **Tests run + results**:
  - `pnpm run ci` passed cleanly (18/18 test files, 69/69 tests passing, eslint and cargo check clean).
- **Open issues / next step**:
  - Next task: T1.8 Benchmark script `pnpm bench:models` in Lanes A/D.

## 2026-11-22 lead-architect Task T1.6 Tracer Implementation (status: done)
- **What changed**:
  - Implemented `Tracer` in `packages/core/src/trace/index.ts`:
    - Structured JSONL writer storing runs at `~/.harness/traces/<sessionId>/<runId>.jsonl`.
    - Event taxonomy per Architecture §4.10: `session_start`, `session_end`, `prompt`, `model_call`, `model_chunk`, `tool_call`, `tool_result`, `permission`, `route`, `escalate`, `compact`, `error`, `loop_warning`.
    - Integrated with `redactSecrets` from `@hx/shared` to sanitize sensitive API keys, tokens, and credentials before writing to disk.
    - Added static `readTrace` helper to replay and parse recorded trace events.
  - Connected `Tracer` into `AgentLoop` in `packages/core/src/loop/index.ts`:
    - Emits `session_start`, `prompt` (with token counts and layer names), `model_call`, `tool_call`, `tool_result`, `loop_warning`, `session_end`, and `error` events across execution steps.
  - Added unit test suite in `packages/core/src/__tests__/trace.test.ts` (4 tests passing) covering event emission, secret redaction, loop integration, and error capture.
- **Decisions made**:
  - Traces are appended synchronously with secret redaction at write time so no crash or unhandled rejection loses trace data or leaks secrets.
- **Tests run + results**:
  - `pnpm test` and `pnpm run ci` passed cleanly (17/17 test files, 61/61 tests passing).
- **Open issues / next step**:
  - Next task: T1.7 Ink CLI MVP in Lane D.

## 2026-11-22 lead-architect Task T1.5 Agent Loop v1 Implementation (status: done)
- **What changed**:
  - Implemented `AgentLoop` in `packages/core/src/loop/index.ts`:
    - Layered prompt integration with `PromptBuilder`.
    - Cumulative message history maintenance.
    - Streaming response iteration and delta emission.
    - Sequential tool call execution with built-in tools (`echo`, `current_time`).
    - Triple safety guards: step limit (`maxSteps`), cumulative token budget (`maxTokens`), and wall-clock timeout (`maxWallMs`).
    - Repetition loop detector: tracks hash of `(toolName, args)`, issues user intervention warning at 3 repetitions, throws `LoopDetected` at 4 repetitions.
    - Strict `AbortSignal` cooperative cancellation checks during streaming and between tool execution steps.
  - Added unit test suite in `packages/core/src/__tests__/loop.test.ts` (5 tests passing).
- **Decisions made**:
  - Sequential execution used for v1 built-in tools; concurrent execution will be layered in Phase 3 with ToolExecutor.
- **Tests run + results**:
  - All 5 loop unit tests passed.
- **Open issues / next step**:
  - Next task: T1.6 Tracer in Lane A.

## 2026-11-22 lead-architect Task T1.4 Prompt Builder Implementation (status: done)
- **What changed**:
  - Implemented `PromptBuilder` in `packages/core/src/prompts/builder.ts`:
    - Strict assembly of Layers 1–6 (Core -> Profile -> Role -> User Global -> Project -> Dynamic context).
    - Preserves byte-identical stable prefix (Layers 1-3) across turns for KV-cache reuse.
    - Implemented drop order on budget overflow: dynamic hints -> project -> user -> profile -> role trimmed (Core is non-removable).
    - Implemented `PromptApprovalStore` (`~/.harness/approvals.json`) with SHA-256 hash checks for repository `AGENTS.md` / `HARNESS.md` first-use approval.
    - Model family and tier mapping (Gemini full 4k, Llama/Coder medium 600, Qwen min 150).
  - Added unit test suite in `packages/core/src/__tests__/prompt-builder.test.ts` (5 tests passing).
- **Decisions made**:
  - Excluded `core.md` from `min` tier (router classification) so router strictly remains within 150 token budget.
- **Tests run + results**:
  - `pnpm run ci` passed cleanly (15/15 test files, 52/52 tests passed).
- **Open issues / next step**:
  - Next task: T1.5 Agent Loop v1 in Lane A.

## 2026-11-22 lead-architect Task T1.3 Model Capability Probe (status: done)
- **What changed**:
  - Implemented model capability prober in `packages/core/src/adapters/probe.ts` (`probeModelCapabilities`).
  - Added unit test suite in `packages/core/src/__tests__/probe.test.ts`.
  - Created automated probe runner script `scripts/probe-models.ts`.
  - Probed real local models running in Ollama on this host and updated `config/models.toml`.
- **Measured Capability Results**:
  - `qwen2.5-coder:7b`:
    - `tools`: **false** (Ollama native tool calling not supported)
    - `parallelTools`: **false**
    - `jsonSchemaFormat`: **true**
    - `maxCtx`: 8192
    - *Architectural Action*: Configured `caps.tools = false`. Routes `qwen2.5-coder:7b` to the generator path with search/replace blocks or fallback JSON parser.
  - `llama3.1:8b`:
    - `tools`: **true**
    - `parallelTools`: **true**
    - `jsonSchemaFormat`: **true**
    - `maxCtx`: 8192
  - `qwen2.5:1.5b`:
    - `tools`: **true**
    - `parallelTools`: **true**
    - `jsonSchemaFormat`: **true**
    - `maxCtx`: 4096 (CPU placement)
- **Decisions made**:
  - Confirmed qwen2.5-coder:7b requires coder-as-generator workflow.
- **Tests run + results**:
  - Live probe executed cleanly; updated `config/models.toml`.
- **Open issues / next step**:
  - Next task: T1.4 Prompt builder in Lane A.

## 2026-11-22 lead-architect Task T1.2 Gemini Adapter Implementation (status: done)
- **What changed**:
  - Implemented `GeminiAdapter` in `packages/core/src/adapters/gemini.ts` with `@google/genai`:
    - Full streaming `generateContentStream` with `ChatChunk` mapping.
    - System instructions via `config.systemInstruction`.
    - Single and parallel function calling (`functionDeclarations` and `functionCalls` mapping).
    - `functionResponse` role mapping for tool results.
    - Token counting via `models.countTokens` with estimator fallback.
    - `GeminiRateLimiter` (token/time interval) and exponential backoff retry with jitter on 429 `RESOURCE_EXHAUSTED`.
  - Added unit test suite in `packages/core/src/__tests__/gemini-adapter.test.ts` (6 tests passing).
- **Decisions made**:
  - Encapsulated rate limiting and 429 backoff inside the adapter so higher-level agent loop logic remains clean.
- **Tests run + results**:
  - `pnpm run ci` passed cleanly (13/13 test files, 46/46 tests passed).
- **Open issues / next step**:
  - Next task: T1.3 Model Capability Probe (specifically testing qwen2.5-coder:7b tool calling).

## 2026-11-22 lead-architect Task T1.1 Ollama Adapter Implementation (status: done)
- **What changed**:
  - Implemented `OllamaAdapter` in `packages/core/src/adapters/ollama.ts` implementing `ModelAdapter`:
    - Full streaming `/api/chat` with NDJSON parsing.
    - Explicit `num_ctx`, `num_gpu` (CPU offloading for 1.5b), `keep_alive`, `format` (JSON schema).
    - Synthetic tool-call ID generation.
    - Fallback tool-call text parser for raw JSON and markdown code blocks.
    - Usage extraction (`prompt_eval_count`, `eval_count`).
    - Model warm (`/api/generate`) and unload (`keep_alive: 0`) hooks.
  - Added unit and live test suite in `packages/core/src/__tests__/ollama-adapter.test.ts`.
- **Decisions made**:
  - Auto-generated synthetic tool call IDs (`call_${counter}_${timestamp}`) to normalize Ollama output with OpenAI/Gemini tool calling format.
- **Tests run + results**:
  - Unit tests mocked response parsing, tool calling, fallback JSON, and OOM 507 errors (5 tests passed).
  - `@live` test executed against local running Ollama instance with `qwen2.5:1.5b` (passed in 4.3s).
  - `pnpm run ci` passed cleanly (12/12 test files, 41/41 tests passed).
- **Open issues / next step**:
  - Next task: T1.2 Gemini Adapter in Lane A.

## 2026-11-22 lead-architect Phase 0 Exit Gate Verification (status: done)
- **What changed**:
  - Executed complete Phase 0 verification suite: `pnpm build && pnpm test && cargo build && hx doctor && pnpm prompts:check`.
  - All 9 tasks in Phase 0 (T0.1 - T0.9) completed, tested, and verified.
- **Verification Evidence**:
  - `pnpm build`: 5 packages built cleanly.
  - `vitest run`: 11 test files, 35 tests passed (100% pass rate).
  - `cargo build`: `hx-fs` and `hx-sandbox` compiled successfully.
  - `hx doctor`: full environment report, all required dependencies passed.
  - `pnpm prompts:check`: 10/10 prompts verified within token budgets and neutral identity verified.
  - ADRs: ADR-001 (baseline), ADR-002 (contracts frozen v1), ADR-003 (MCP conventions) recorded in `docs/DECISIONS.md`.
- **Exit Gate Verdict**: PHASE 0 PASSED. Ready for Phase 1.

## 2026-11-22 lead-architect Task T0.9 MCP Conventions ADR & Fixture Server (status: done)
- **What changed**:
  - Authored ADR-003 in `docs/DECISIONS.md` freezing MCP tool-naming conventions (`<server>.<tool>`), model-safe aliases (`[a-zA-Z0-9_]{1,64}`), and annotation semantics (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`, tiers 0-4).
  - Built fake MCP fixture server in `packages/mcp-host/fixtures/fake-mcp-server.ts` implementing JSON-RPC stdio protocol (`initialize`, `tools/list`, `tools/call`, `ping`) with `echo`, `add`, `delay`, `write`, and `fail` tools.
  - Added integration test suite in `packages/mcp-host/src/__tests__/fixture-server.test.ts` verifying stdio MCP protocol lifecycle and tool execution.
- **Decisions made**:
  - Model aliases use underscore replacement for dots and sequential suffixing for conflict resolution.
- **Tests run + results**:
  - `pnpm run ci` passed cleanly (11/11 test files, 35/35 tests passed, cargo check passed).
- **Open issues / next step**:
  - Phase 0 exit gate verification.

## 2026-11-22 lead-architect Tasks T0.5-T0.8 Prompt Analysis & Distillation (status: done)
- **What changed**:
  - Analyzed `docs/reference/prompt.md` (~119k tokens, 227 sections) and created `docs/reference/prompt-analysis.md`.
  - Wrote stable harness prompt `prompts/core.md` (255 tokens / 300 token budget).
  - Distilled and authored role prompts and model profiles:
    - `prompts/roles/assistant.medium.md` (302 tokens / 600 budget)
    - `prompts/roles/assistant.full.md` (671 tokens / 4000 budget)
    - `prompts/roles/coder.medium.md` (276 tokens / 600 budget)
    - `prompts/roles/coder.full.md` (395 tokens / 4000 budget)
    - `prompts/roles/router.min.md` (77 tokens / 150 budget)
    - `prompts/profiles/llama3.md` (45 tokens / 150 budget)
    - `prompts/profiles/qwen.md` (51 tokens / 150 budget)
    - `prompts/profiles/qwen-coder.md` (44 tokens / 150 budget)
    - `prompts/profiles/gemini.md` (44 tokens / 150 budget)
  - Implemented prompt validator in `packages/core/src/prompts/validator.ts` and CLI linter `scripts/check-prompts.ts` (`pnpm prompts:check`).
  - Added vitest unit test in `packages/core/src/__tests__/prompts.test.ts`.
- **Decisions made**:
  - Replaced vendor identity with neutral role framing: "You are the assistant inside a local CLI harness."
  - Enforced frontmatter token budgets and zero tolerance for banned vendor identity strings.
- **Tests run + results**:
  - `pnpm prompts:check` passed with all 10 prompt files within budget and free of banned strings.
  - `pnpm run ci` passed cleanly (10/10 test files, 30/30 tests passed).
- **Open issues / next step**:
  - Next task: T0.9 ADR and Fake MCP Fixture Server.

## 2026-11-22 lead-architect Task T0.4 Config Loader Implementation (status: done)
- **What changed**:
  - Created default TOML configuration files: `config/default.toml`, `config/models.toml`, `config/policy.toml`, `config/privacy.toml`, `config/servers.toml`.
  - Implemented config loader in `packages/core/src/config/index.ts`:
    - `ensureHarnessDirs`: auto-creates `~/.harness` subdirectories (`blobs`, `traces`, `sessions`, `backups`, `db`, `prompts`).
    - `loadConfig`: loads and merges user config with bundled defaults, copies defaults if missing, validates with Zod, applies environment variable overrides (`HX_DEFAULT_MODEL`, `HX_DEFAULT_ROLE`, `HX_LOG_LEVEL`, `HX_FALLBACK_MODEL`, `HX_DATA_DIR`).
    - Handled TOML syntax error reporting and schema validation issue formatting.
  - Added unit test suite in `packages/core/src/__tests__/config-loader.test.ts` (5 tests passing).
- **Decisions made**:
  - Integrated `smol-toml` as fast, spec-compliant TOML parser.
- **Tests run + results**:
  - `pnpm run ci` passed cleanly (9/9 test files, 29/29 tests passed, 0 eslint warnings).
- **Open issues / next step**:
  - Next tasks: T0.5-T0.8 Prompt Analysis & Distillation in Lane E.

## 2026-11-22 lead-architect Task T0.3 hx doctor and Environment Resolution (status: done)
- **What changed**:
  - Implemented `runDoctor()` and `formatDoctorTable()` in `packages/cli/src/doctor/index.ts`.
  - Added CLI subcommand `hx doctor` with `--json` option in `packages/cli/src/bin/hx.ts`.
  - Added unit tests in `packages/cli/src/__tests__/doctor.test.ts`.
  - Executed `hx doctor` and verified full environment report.
- **Doctor Report Output**:
  ```
  STATUS   | COMPONENT                | DETAILS
  --------------------------------------------------------------------------------
  [ PASS ] | Operating System         | Omarchy (x64, kernel 7.2.15-1-omarchy)
  [ PASS ] | User Shell               | /usr/bin/bash
  [ PASS ] | CPU & RAM                | AMD Ryzen 7 7435HS (16 cores), 23.1 GB RAM
  [ PASS ] | Node.js                  | v22.23.4 (Node >= 20 required)
  [ PASS ] | pnpm                     | v12.9.1
  [ PASS ] | Rust & Cargo             | rustc 1.98.1 / cargo 1.98.1
  [ PASS ] | NVIDIA GPU & VRAM        | NVIDIA GeForce RTX 4050 Laptop GPU | Driver: 615.78.08 | VRAM: 5166MiB free / 6141MiB total
  [ PASS ] | Ollama Service           | Connected (nomic-embed-text, llama3.1:8b, qwen2.5:1.5b, qwen2.5-coder:7b)
  [ PASS ] | Ollama Models            | All target models present
  [ WARN ] | Gemini API Key           | GEMINI_API_KEY not set (cloud escalation/planning disabled)
  [ PASS ] | LibreOffice (soffice)    | LibreOffice 26.8.1.1 680(Build:1)
  [ PASS ] | Git                      | git version 2.56.0
  [ PASS ] | Docker                   | Docker version 29.9.2, build a82e528901
  --------------------------------------------------------------------------------
  Verdict: All required dependencies are satisfied.
  ```
- **PRD Open Questions Resolved**:
  - Host OS: Omarchy Linux (kernel 7.2.15, Arch-based).
  - Shell: `/usr/bin/bash`.
  - Ollama version: 0.40.7, service running on port 11434.
  - LibreOffice installed: Yes (`LibreOffice 26.8.1.1`).
  - Available Ollama models: `llama3.1:8b`, `qwen2.5:1.5b`, `qwen2.5-coder:7b`, `nomic-embed-text:latest`.
  - Gemini model: `gemini-2.5-flash` configured as default fallback; key not currently in environment (mocking available for offline tests).
- **Tests run + results**:
  - `pnpm run ci` passed (eslint 0 warnings, tsc -b passed, vitest 8/8 files, 24/24 tests passed, cargo check passed).
  - `hx doctor` passed in terminal table and JSON mode.
- **Open issues / next step**:
  - Next task: T0.4 Config loader in Lane A.

## 2026-11-22 lead-architect Task T0.2 Contracts Frozen v1 (status: done)
- **What changed**:
  - Implemented core message types and schemas (`SystemMessage`, `UserMessage`, `AssistantMessage`, `ToolMessage`, `Part`, `ToolCall`, `ToolResult`) in `packages/shared/src/types/message.ts`.
  - Implemented tool schemas and descriptors (`ToolDescriptor`, `ToolAnnotations`, `ToolTier`) in `packages/shared/src/types/tool.ts`.
  - Implemented model adapter interfaces and capabilities (`ModelAdapter`, `ModelCaps`, `ChatRequest`, `ChatChunk`, `ChatUsage`) in `packages/shared/src/types/adapter.ts`.
  - Implemented Zod configuration schemas (`GeneralConfig`, `ModelProfile`, `ModelsConfig`, `PolicyRule`, `PrivacyConfig`, `ServersConfig`, `HxConfig`) in `packages/shared/src/types/config.ts`.
  - Implemented typed error taxonomy (`HxError`, `ModelError`, `ToolValidationError`, `ToolExecError`, `PermissionDenied`, `PrivacyBlocked`, `BudgetExceeded`, `LoopDetected`) in `packages/shared/src/errors/index.ts`.
  - Implemented structured logger with secret redaction (`redactSecrets`, `Logger`, `logger`) in `packages/shared/src/logger/index.ts`.
  - Implemented token estimator (`estimateTokens`, `estimateMessageTokens`) in `packages/shared/src/tokens/index.ts`.
  - Added unit test suites covering all shared modules (22 tests passing).
  - Recorded ADR-002: "Contracts Frozen v1" in `docs/DECISIONS.md`.
- **Decisions made**:
  - All contracts frozen for v1 to enable independent parallel development across lanes.
- **Tests run + results**:
  - `pnpm run ci` passed cleanly (eslint, tsc -b, vitest 7/7 files, 22/22 tests, cargo check).
- **Open issues / next step**:
  - Next task: T0.3 `hx doctor` in Lane D.

## 2026-11-22 lead-architect Task T0.1 Monorepo Scaffold (status: done)
- **What changed**:
  - Initialized pnpm monorepo workspace (`pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json`, `tsconfig.json`, `eslint.config.js`, `.prettierrc`, `vitest.config.ts`).
  - Initialized Cargo workspace (`Cargo.toml`) with members `servers/fs` and `servers/sandbox`.
  - Created package skeletons: `@hx/shared`, `@hx/core`, `@hx/mcp-host`, `@hx/cli`, `@hx/evals`, `hx-fs`, `hx-sandbox`.
- **Decisions made**:
  - Used strict ESM and TypeScript project references.
  - Configured pnpm workspace build scripts and esbuild approvals.
- **Tests run + results**:
  - `pnpm install` and `cargo check` verified.
- **Open issues / next step**:
  - T0.2 Shared contracts.

## 2026-11-22 lead-architect Repository Inspection and Phase 0 Kickoff (status: done)
- **What changed**:
  - Inspected host environment: Linux Omarchy (Kernel 7.2.15, Arch-based), AMD Ryzen 7 7435HS (16 vCPUs), 24GB RAM, NVIDIA RTX 4050 Laptop GPU (6GB VRAM, CUDA 13.4, Driver 615.78.08).
  - Verified Node.js v22.23.4, pnpm v12.9.1, Rust/Cargo 1.98.1, Docker 29.9.2, LibreOffice 26.8.1.1.
  - Found Ollama v0.40.7 with local models: `llama3.1:8b`, `qwen2.5:1.5b`, `qwen2.5-coder:7b`. Started background download of `nomic-embed-text`.
  - Located reference prompt at `/home/krishna/Downloads/claude-opus-5.5_system_prompt.md` (478 KB) and copied to `docs/reference/prompt.md`.
  - Initialized git repository at `/home/krishna/Projects/harness`.
  - Populated `AGENTS.md`, `docs/DECISIONS.md`, and `docs/PROGRESS.md`.
- **Decisions made**:
  - Proceed with Phase 0 tasks in order: T0.1 (scaffold), T0.2 (shared contracts), T0.3 (hx doctor), T0.4 (config loader), T0.5-T0.8 (prompt analysis & distillation), T0.9 (ADR & fake MCP fixture).
- **Tests run + results**:
  - Environment inspection passed.
  - Ollama server started as daemon, local models verified via API.
- **Open issues / next step**:
  - `GEMINI_API_KEY` is not currently set in environment (optional for local-first testing, required for Gemini live tests).
  - Next step: T0.1 Monorepo scaffold (pnpm workspace, cargo workspace, tsconfig base, eslint, prettier, vitest, CI script).

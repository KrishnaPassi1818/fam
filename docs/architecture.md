# Architecture

## 1. Principles
1. **The harness matters more than the model.** Intelligence lives in routing, context, validation, and verification.
2. **MCP is the boundary.** The TS core never contains domain tools. Capabilities are MCP servers; process boundaries are the language boundary.
3. **Small-context first.** Every component must work inside a 4–8k local context budget.
4. **Never trust model output or tool output.** Validate calls. Treat results as data.
5. **Everything recoverable and observable.**
6. **Adapters hide provider quirks.** The core knows one format.

## 2. Process view

```
                ┌───────────────────────────── fam (Node/TS) ─────────────────────────────┐
 User ──▶ fam-tui ──IPC──▶ Session ─▶ PromptBuilder ─▶ Router ─▶ Orchestrator ─▶ AgentLoop │
 (Ratatui Rust) │              ▲                 │            │             │             │
                │        MemoryStore       ToolRetriever   Planner(DAG)  Executor ─┐      │
                │              ▲                 │            │             │      │      │
                │        ContextManager ◀────────┴────────────┴─────────────┘      │      │
                │              │                                       PermissionGate    │
                │        ModelAdapters ─ Ollama │ Gemini                     │           │
                │        Tracer · Config · Budgets                    McpHost│           │
                └───────────────────────────────────────────────────────────┼───────────┘
                                                            stdio / HTTP    │
          ┌──────────┬───────────┬────────────┬─────────────┬──────────────┴──┐
          │ fs (Rust)│sandbox(Rs)│ office (TS)│  web (TS)   │ system (Rs/TS)  │ + 3rd-party MCP
          └──────────┴───────────┴────────────┴─────────────┴─────────────────┘
```

External runtime dependencies: Ollama (localhost:11434), Gemini API, LibreOffice (`soffice`), git, optionally Docker/bubblewrap/Job Objects for the sandbox.

## 3. Repo layout (pnpm workspace + cargo workspace)

```
harness/
├─ crates/
│  └─ fam-tui/       Rust (Ratatui + Crossterm) native TUI frontend
├─ packages/
│  ├─ core/         agent loop, adapters, router, context, memory, prompt, planner, executor
│  ├─ mcp-host/     MCP client manager, tool registry bridge
│  ├─ cli/          CLI entrypoint, commands, doctor, Ratatui IPC bridge
│  ├─ evals/        task definitions, runner, reports
│  └─ shared/       types, zod schemas, token counting, logger
├─ servers/
│  ├─ fs/           Rust (rmcp)
│  ├─ sandbox/      Rust (rmcp)
│  ├─ system/       Rust or TS (decide in Phase 10)
│  ├─ office/       TS
│  ├─ web/          TS
│  └─ memory/       (optional) TS, only if memory is exposed over MCP
├─ prompts/         core.md, profiles/, roles/
├─ config/          default.toml, policy.default.toml, models.toml
└─ docs/
```

## 4. Component specs

### 4.1 Model adapter layer (`core/adapters`)
```ts
interface ModelAdapter {
  id: string;                          // "ollama:qwen3.5:4b" | "gemini:<model>"
  caps: { tools: boolean; parallelTools: boolean; vision: boolean;
          jsonSchemaFormat: boolean; maxCtx: number };
  chat(req: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatChunk>;
  countTokens(msgs: Message[]): Promise<number> | number;
  warm?(): Promise<void>;  unload?(): Promise<void>;
}
type Message =
  | { role: "system"|"user"; content: string; parts?: Part[] }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; callId: string; name: string; content: string; isError?: boolean };
interface ToolCall { id: string; name: string; args: unknown }
```
- **Ollama adapter**: `/api/chat`, always set `options.num_ctx`, `keep_alive`, `format` (JSON schema) when needed. The router uses `num_gpu: 0`. Generate synthetic call IDs (Ollama may omit them). Surface `prompt_eval_count` and `eval_count`.
- **Gemini adapter**: `@google/genai`, system prompt via `config.systemInstruction`, native function calling including parallel calls, map call IDs, handle 429 with backoff and a rate limiter.
- **Capability flags drive behavior.** If `parallelTools=false`, the loop doesn't expect parallel calls. If `tools=false` (e.g. coder), use the generator path.
- **Fallback tool-call parser** for models that emit calls as JSON in text.

### 4.2 Agent loop (`core/loop`)
The agent loop is governed by an explicit `AgentStateMachine` (`packages/core/src/loop/state-machine.ts`) tracking 13 formal execution states:
- `IDLE`: Initial state before execution starts.
- `UNDERSTANDING`: Analyzing user request and intent.
- `PLANNING`: Constructing execution plan or DAG.
- `DISCOVERING_TOOLS`: Selecting relevant tools via router/retriever.
- `REASONING`: Invoking model adapter with context.
- `WAITING_FOR_PERMISSION`: Awaiting user authorization for Tier 2/3 tools.
- `EXECUTING`: Running approved tool calls via `ToolExecutor`.
- `OBSERVING`: Processing tool results and updating conversation context.
- `RECOVERING`: Handling tool errors, repetition traps, or repair attempts.
- `VERIFYING`: Executing automated tests, syntax checks, or outcome verification.
- `COMPLETED`: Successful task termination.
- `FAILED`: Unrecoverable failure or budget exhaustion.
- `CANCELLED`: User or signal abortion.

```
while !done:
  stateMachine.transition(UNDERSTANDING -> PLANNING -> DISCOVERING_TOOLS -> REASONING)
  prompt  = PromptBuilder.build(...)
  tools   = ToolRetriever.select(turn)
  ctx     = ContextManager.fit(history, prompt, tools, model)
  resp    = adapter.chat(ctx)
  if resp.toolCalls:
    stateMachine.transition(EXECUTING)
    results = Executor.run(calls)   // Backs up files via BackupService before writes
    stateMachine.transition(OBSERVING)
    history += results
    continue
  verdict = Verifier.check(resp)       // optional, by task type
  if verdict.fail && attempts < N:
    stateMachine.transition(RECOVERING)
    feedback → continue
  if verdict.fail: Escalator.next()    // bigger model
  stateMachine.transition(COMPLETED)
  done
guards: maxSteps, maxTokens, maxWallMs, repetition detector (>=3 repetitions), abort signal
```
Loop detection: hash of (tool, normalized args) repeated ≥3 → halts loop or injects correction feedback, preventing model runaway.

### 4.3 Tool registry and MCP host (`mcp-host`)
- `McpHost` spawns servers from config (`stdio` or `http`), lazily on first use or first retrieval hit. It handles `initialize`, `tools/list`, `list_changed`, reconnect with backoff, and server health.
- Tool names are namespaced `server.tool`. Presented to models with a model-safe alias (`[a-zA-Z0-9_]`, ≤ 64 chars).
- `ToolDescriptor { name, alias, description, inputSchema, annotations{readOnlyHint,destructiveHint,idempotentHint,openWorldHint}, category, tier, timeoutMs, embedding }`
- Local overrides in `config/tools.toml` can force tier, timeout, category, and description rewrite (shorter descriptions for small models).
- Support MCP resources and prompts (list/read), surfaced by built-in meta tools `resource_read` and exposed as `/commands`. Sampling and elicitation are P3.

### 4.4 Executor (`core/executor`)
- Input: `ToolCall[]`. Steps: validate (ajv) → repair-on-fail → permission gate → schedule → run → normalize result.
- Scheduling: calls with `readOnlyHint=true` run concurrently (limit `maxParallelTools`, default 6). Others run serially in model order. Calls touching the same path are serialized. Mixed batches run reads first, then writes.
- Per-call timeout and abort. Errors become `tool` messages with `isError: true`, never exceptions.
- Results are matched by `callId`. Output over the size threshold is offloaded (see 4.5).
- The DAG executor (Phase 9) reuses this for node execution.

### 4.5 Context manager (`core/context`)
- Budget table per model (from `models.toml`). Default for 8B local: `num_ctx 8192` with allocation: system 500, tools 1000, memory 500, history 2500, work 3500.
- Strategies, in order: (1) offload large tool outputs to `~/.fam/blobs/<hash>` and replace them with `{handle, summary, size}`, with built-in `blob_read(range)` and `blob_grep` tools; (2) drop old tool results to one-line stubs; (3) compact older turns with the 1.5b model into a rolling summary that preserves facts, file paths, decisions, and open TODOs; (4) hard-truncate oldest as the last resort.
- Always count tokens before sending. Never let Ollama truncate silently. If the prompt + reserved output exceeds `num_ctx`, the manager must act.
- Keep the system-prompt prefix byte-stable for KV-cache reuse. Dynamic content goes last.

### 4.6 Router and tool retrieval (`core/router`, `core/tools/retriever`)
- Router (qwen2.5:1.5b, CPU, JSON-schema output): `{intent, complexity 1-5, categories[], needs_code, needs_web, needs_office, privacy: "normal"|"local_only", confidence}`.
- A rules fast path (regex/keywords) skips the LLM for obvious cases.
- Routing policy (`config/routing.toml`): maps (intent, complexity, privacy) → model chain. Example: `coding+complexity≤3 → coder` generator path; `complexity≥4 → gemini planner`; `local_only → never gemini`.
- Tool retrieval: embed descriptions (`nomic-embed-text` via Ollama), cosine top-K (default 6) combined with router categories and a "sticky" set of tools used recently, plus an always-on core set (`find_tools`, `blob_read`, `todo`, `remember`).

### 4.7 Planner, orchestrator, escalation (`core/orchestrator`)
- Simple tasks: single loop on the chosen model.
- Complex: Gemini produces a plan `Plan { nodes: [{id, goal, deps[], tools?, model?, verify?}] }` as structured output. The DAG executor runs ready nodes concurrently (Gemini parallel, local serialized by a **model lock**), passing results as handles.
- **Escalation ladder**: worker (qwen3.5:4b) → retry with repair → coder (if code) → Gemini. Escalation passes a compacted state, not the whole history. Privacy check at every hop.
- **Model lock/scheduler**: a queue that serializes local LLM calls, batches by model to minimize VRAM swaps, and lets Gemini calls bypass it.

### 4.8 Coding loop (`core/coding`)
1. Checkpoint (`git stash`/temp branch/commit). 2. Gather context through `fs` tools (repo map, grep, read ranges). 3. Coder-as-generator: input = instruction + relevant file slices, output = **search/replace blocks only**. 4. `fs.apply_edit` with fuzzy-match tolerance (whitespace) and a clear failure message. 5. Run formatter/lint/tests via sandbox. 6. Feed concise failures back, max N=3. 7. Escalate to Gemini with a compacted diff and failure log. 8. Show a diff and request approval for completion or keep auto-approve within the workspace.

### 4.9 Privacy gate (`core/privacy`)
Applies before any Gemini request. Path globs (`privacy.toml`), content detectors (API keys, passwords, tokens via regex and entropy), and per-session flags. A match blocks or redacts, or asks the user. Tool results carry `taint: local_only` which propagates into the conversation. A tainted conversation stays local unless the user overrides.

### 4.10 Observability (`core/trace`)
JSONL per run at `~/.fam/traces/<session>/<run>.jsonl`, with events: `prompt`, `model_call`, `model_chunk` (optional), `tool_call`, `tool_result`, `permission`, `route`, `escalate`, `compact`, `error`. Include timings, token counts, and model ids. `fam replay <run>` re-renders; `fam trace stats` summarizes. Secrets are redacted at write time.

### 4.11 Servers
| Server | Lang | Key tools |
|---|---|---|
| fs | Rust | `read_file(range)`, `list_dir`, `glob`, `grep`, `apply_edit`, `write_file`, `move`, `trash`, `repo_map`, `file_info` |
| sandbox | Rust | `run_command`, `run_code(lang)`, `kill`, with cpu/mem/time limits, workspace-scoped FS, no network by default |
| office | TS | `docx_*`, `xlsx_*`, `pptx_*`, `pdf_*`, `convert`, `render_preview`, `xlsx_query_sql` |
| web | TS | `web_search`, `fetch_markdown`, `fetch_many` |
| system | TBD | `clipboard_*`, `notify`, `reminder_*`, `timer_*`, `open_app`, `sysinfo`, `screenshot` |

### 4.12 Config and storage (`~/.fam/`)
`config.toml`, `models.toml`, `routing.toml`, `policy.toml`, `privacy.toml`, `tools.toml`, `servers.toml`, `SYSTEM.md`, `prompts/`, `db/harness.sqlite`, `blobs/`, `traces/`, `sessions/`, `backups/`.

## 5. Key technology choices
| Concern | Choice |
|---|---|
| Workspace | pnpm + TypeScript (strict, ESM), cargo workspace |
| Validation | zod (own config/types), ajv (tool JSON Schemas) |
| CLI | Ratatui (Rust TUI via `crates/fam-tui`), commander for TS subcommands & IPC bridge |
| MCP | `@modelcontextprotocol/sdk` (TS), `rmcp` (Rust) |
| Models | `ollama` JS client or raw fetch, `@google/genai` |
| DB | SQLite (`better-sqlite3`) + `sqlite-vec` (fallback: in-memory cosine) |
| Tokens | tiktoken-compatible estimate for local (calibrated against Ollama counts); Gemini `countTokens` |
| Tests | vitest, cargo test, eval runner |
| Office | ExcelJS/SheetJS, `docx`, JSZip, mammoth, pptxgenjs, pdf-lib/pdfjs, DuckDB or SQLite, LibreOffice headless |

## 6. Hardware profile (defaults in `models.toml`)
| Model | Placement | num_ctx | Notes |
|---|---|---|---|
| qwen2.5:1.5b | CPU (`num_gpu:0`) | 4096 | router, compactor, validators |
| qwen3.5:4b | GPU | 4096 (100% GPU offload, ~3.1 GB) | general worker; `keep_alive` 10m |
| qwen2.5-coder:7b | GPU | 8192 | generator path; unload other 8B first |
| nomic-embed-text | CPU | n/a | embeddings |
| Gemini | API | large | planner, escalation, vision, long-context |

Recommended env: `OLLAMA_FLASH_ATTENTION=1`, `OLLAMA_KV_CACHE_TYPE=q8_0`, `OLLAMA_MAX_LOADED_MODELS=1` (plus the CPU models), `OLLAMA_NUM_PARALLEL=1`.
The Phase 1 agent must **measure** real VRAM use and tokens/s, then write the tuned values to `models.toml`.

## 7. Error taxonomy
`ModelError` (timeout, OOM, rate-limit), `ToolValidationError` (repairable), `ToolExecError`, `PermissionDenied`, `PrivacyBlocked`, `BudgetExceeded`, `LoopDetected`. Each has a defined loop response (retry, repair, escalate, or abort with a user message).

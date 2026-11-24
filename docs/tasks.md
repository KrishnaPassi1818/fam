# Tasks

Legend: `[ ]` todo · `[~]` in progress (add agent id) · `[x]` done · `[!]` blocked
Lane: A core, B rust, C office/web, D cli, E prompts/evals, F mcp-host
Each task: ID · lane · deps · deliverable · acceptance (AC).

## Phase 0: Foundations and prompt analysis

- [x] **T0.1** · A · none · Monorepo scaffold: pnpm workspace, tsconfig base (strict, ESM), eslint, prettier, vitest, cargo workspace, CI script (`pnpm ci` = lint+typecheck+test+cargo check).
  AC: `pnpm ci` passes on a clean checkout.
- [x] **T0.2** · A · T0.1 · `packages/shared` contracts: Message, ToolCall, ToolResult, ToolDescriptor, ModelAdapter, ChatRequest/Chunk, Config schemas (zod), error classes, logger, token-count util.
  AC: types exported, unit tests for schema parsing, ADR "contracts frozen v1".
- [x] **T0.3** · D · T0.1 · `fam doctor`: detect OS/shell, Node, Rust, Ollama (version, pulled models), GPU/VRAM via `nvidia-smi`, `soffice`, git, `GEMINI_API_KEY`.
  AC: prints pass/warn/fail table, JSON output with `--json`. Record the actual report in PROGRESS.md. **Resolve the PRD open questions.**
- [x] **T0.4** · A · T0.2 · Config loader: `~/.fam/` layout creation, TOML parse and zod validation, defaults from `config/*.toml`, env overrides.
  AC: missing files create defaults, invalid files give readable errors.
- [x] **T0.5** · E · none · **Analyze `docs/reference/prompt.md`**. Read the whole file. Produce `docs/reference/prompt-analysis.md` with (a) estimated total token count, (b) a section inventory table: `# | section title/summary | tokens | KEEP/ADAPT/DROP | reason`, (c) a list of behavioral rules worth keeping grouped by theme (tone, formatting, ambiguity handling, honesty, safety, tool etiquette, injection handling, search/citation, code conventions), (d) a list of vendor-specific items that must be dropped (identity, product features, tool names/syntax, model names, cutoff claims), (e) notes on anything that conflicts with `core.md` rules.
  AC: every section of the file appears in the inventory. No verbatim copy of more than a short phrase.
- [x] **T0.6** · E · T0.5 · Write `prompts/core.md` (harness rules: tool protocol, untrusted-data rule, parallel-call guidance, ask-vs-act, safety), ≤ 300 tokens, with a front-matter budget.
  AC: token test passes.
- [x] **T0.7** · E · T0.5, T0.6 · Distill and write `prompts/roles/assistant.full.md` (≤ 4000 tok), `assistant.medium.md` (≤ 600), `coder.full.md`, `coder.medium.md` (≤ 600), `router.min.md` (≤ 150, rigid JSON output), plus model profiles `prompts/profiles/{qwen35,qwen,qwen-coder,gemini}.md` (≤ 150 each).
  AC: neutral identity only (test greps for vendor names), token budgets enforced by a test, rewritten in own words, most important rules first.
- [x] **T0.8** · E · T0.7 · Prompt budget test and linter script (`pnpm prompts:check`): counts tokens, checks front-matter, and greps for banned identity strings.
  AC: runs in CI.
- [x] **T0.9** · A · T0.2 · ADR: freeze MCP tool-name conventions, alias rules, and annotation usage. Add fixtures for a fake MCP server used in tests.
  AC: `docs/DECISIONS.md` created, fixture server runs.

**Phase 0 gate**: see plan.md.

## Phase 1: Adapters, loop, CLI MVP

- [x] **T1.1** · A · T0.2 · Ollama adapter: streaming `/api/chat`, `num_ctx`/`num_gpu`/`keep_alive`/`format` options, synthetic call IDs, usage stats, abort, model warm/unload, tool-call text fallback parser.
  AC: unit tests with a mocked server; `@live` test against real Ollama.
- [x] **T1.2** · A · T0.2 · Gemini adapter: `@google/genai`, `systemInstruction`, function calling (single and parallel), usage, 429 backoff plus rate limiter, model name from config.
  AC: mocked tests; `@live` test if a key is present.
- [x] **T1.3** · A · T1.1, T1.2 · Capability probe: detect and cache per-model caps (tools, parallel, json-format). **Specifically test qwen2.5-coder:7b tool calling and record the result.**
  AC: results written to `~/.fam/models.toml` and PROGRESS.md.
- [x] **T1.4** · A · T0.7, T0.4 · Prompt builder: layers 1–6, model-tier mapping, budget enforcement and drop order, project-file hash approval store, `/system` data.
  AC: tests for ordering, budget trimming, prefix stability across turns (byte-identical stable layers).
- [x] **T1.5** · A · T1.1, T1.4 · Agent loop v1: message history, sequential tool calls, limits (steps/tokens/time), loop detector, abort; built-in tools `echo`, `current_time`.
  AC: loop tests with a scripted fake adapter covering limit, abort, and repeat detection.
- [x] **T1.6** · A · T0.2 · Tracer: JSONL writer, redaction, event types per architecture 4.10.
  AC: trace emitted for every loop step. Redaction test.
- [x] **T1.7** · D · T1.5 · Ratatui Rust TUI: prompt input, streamed markdown output, tool-call lines, status bar, `/help /system /model /clear /exit`, flags `--model --system --append-system --system-file --role`. (Redesigned with Rust Ratatui `crates/fam-tui` and headless IPC bridge).
  AC: manual demo plus snapshot tests for the render components.
- [x] **T1.8** · A/D · T1.1 · Benchmark script `pnpm bench:models`: for each local model, measure load time, tokens/s, VRAM (nvidia-smi), and max stable `num_ctx` (stepwise 4096→8192→…) without OOM or CPU spill. Write `models.toml`.
  AC: results table in PROGRESS.md, `models.toml` reflects measured values.
- [x] **T1.9** · D · T1.7 · `scripts/demo-p1`.
  AC: gate demo from plan.md passes.

## Phase 2: MCP host and `fs` server

- [x] **T2.1** · F · T0.9 · MCP host: stdio transport via the official SDK, server config (`servers.toml`), lifecycle (lazy start, restart with backoff, shutdown), tool listing and `list_changed`.
  AC: integration test against the fixture server.
- [x] **T2.2** · F · T2.1 · Streamable HTTP transport and auth headers from env.
  AC: test against a local HTTP fixture.
- [x] **T2.3** · F · T2.1 · Registry bridge: namespacing, aliasing, annotations to flags, `tools.toml` overrides (tier, timeout, category, short description), resource and prompt listing, `resource_read` meta-tool.
  AC: tests for alias collisions and overrides.
- [x] **T2.4** · B · T0.9 · Rust `fs` server skeleton (rmcp, stdio): `list_dir`, `file_info`, `read_file(path,start,end)`, root confinement and symlink-escape rejection.
  AC: cargo tests, MCP stdio integration test.
- [x] **T2.5** · B · T2.4 · `glob`, `grep` (regex, context lines, limits, gitignore-aware), bounded output with a truncation indicator.
  AC: tests on a fixture tree incl. binary and large files.
- [x] **T2.6** · B · T2.4 · `apply_edit` (search/replace blocks, whitespace-tolerant fuzzy match, ambiguity detection, `dry_run`, backups), `write_file`, `move`, `trash` (OS trash).
  AC: tests for ambiguous match, no match, multi-block, CRLF/LF.
- [x] **T2.7** · B · T2.4 · `repo_map` via tree-sitter (TS/JS, Python, Rust, Go at minimum), size-bounded output ranked by file importance.
  AC: snapshot test on a fixture repo, output ≤ configured token estimate.
- [x] **T2.8** · F/D · T2.1 · `fam mcp list|add|remove|test`, first-connect approval UI showing the command and tools.
  AC: manual demo, unit tests for the config edits.
- [x] **T2.9** · A · T2.3, T2.5 · Wire registry tools into the loop (all tools presented for now; retrieval comes in P5). Demo: "find all TODOs and summarize by file".
  AC: gate demo passes with qwen3.5:4b; record the transcript. Connect one third-party MCP server by config only.

## Phase 3: Executor, permissions, approvals

- [x] **T3.1** · A · T2.3 · Validator: ajv against tool schemas, error formatter per design 3, repair loop (≤ 2 rounds), coercion of safe cases (`"5"`→5).
  AC: table-driven tests for common small-model mistakes.
- [x] **T3.2** · A · T3.1 · Executor: concurrency limiter, read-only parallel batch, serialized writes, path-conflict detection, per-tool timeout and abort, partial-failure results, result matching by `callId`.
  AC: tests with fake tools that prove parallel timing (N×100 ms tools finish in ~100 ms) and serial write ordering.
- [x] **T3.3** · A · T3.2 · Permission gate: tiers per design 4, `policy.toml` (allow/deny globs, command-prefix allowlist), session grants, `PermissionDenied` results.
  AC: policy tests, including deny overrides allow.
- [x] **T3.4** · D · T3.3 · Approval UI: preview (diff/command/path), y/a/n/e keys, grouped parallel approvals, typed confirmation for tier 4.
  AC: component tests plus manual demo.
- [x] **T3.5** · A · T3.3 · Undo/backup service: pre-write backups in `~/.fam/backups`, `/undo` restores the last change set.
  AC: round-trip tests.
- [x] **T3.6** · A · T1.2 · Privacy gate v1: path globs (`privacy.toml`), secret detectors (regex+entropy), taint propagation from tool results, block/redact/ask, fail-closed.
  AC: test with mock Gemini adapter asserting that no tainted content is ever sent.
- [x] **T3.7** · A/D · T1.6 · Tracing complete (permission, route, escalate events); `fam replay <run>`; `fam trace stats`.
  AC: replay renders a recorded trace.
- [x] **T3.8** · E · T3.2 · Eval framework scaffold: task format (YAML: prompt, fixtures, checks), runner (per model), report (JSON + markdown), the first 5 tasks.
  AC: `fam eval` runs and reports.

## Phase 4: Context manager

- [x] **T4.1** · A · T1.5 · Token budgeter: per-model budget table, accounting by component, pre-send check that guarantees `prompt + reserve ≤ num_ctx`.
  AC: property tests (never exceeds).
- [x] **T4.2** · A · T3.2 · Blob store and offloading: large result → handle and summary (first/last lines and size), built-in `blob_read(handle,range)` and `blob_grep`.
  AC: tests, and an e2e with a 1 MB grep result.
- [x] **T4.3** · A · T4.1 · Result stubbing and a history trimming policy.
  AC: tests for ordering and idempotence.
- [x] **T4.4** · A · T1.1 · Compactor using qwen2.5:1.5b (CPU, JSON schema output): facts, decisions, files, open items; keep the last 4 turns; `/compact`.
  AC: fact-recall test over a scripted conversation.
- [x] **T4.5** · A · T4.1 · KV-prefix stability: ensure the stable prefix is byte-identical between turns; add a test and a measurement of `prompt_eval_count` reuse.
  AC: second turn's prompt eval is mostly cached (record numbers).
- [x] **T4.6** · D · T4.1 · `/context` view (component breakdown), status bar accuracy.
  AC: manual check.
- [x] **T4.7** · A/E · T4.4 · 60-turn soak test.
  AC: phase gate.

## Phase 5: Router and tool retrieval

- [x] **T5.1** · A · T1.1 · Rules fast path and the 1.5b router (JSON schema output per architecture 4.6) with a confidence threshold.
  AC: 50-prompt labeled set ≥ 90% intent accuracy; latency < 800 ms CPU.
- [x] **T5.2** · A · T5.1 · Routing policy loader (`routing.toml`) and the model-chain resolver, including `local_only` rules and the `--model` override.
  AC: policy tests.
- [x] **T5.3** · A · T2.3 · Tool embeddings via `nomic-embed-text` (cached, invalidated on description change), top-K retrieval, category boost, sticky and core sets.
  AC: retrieval@6 ≥ 90% on the labeled prompts.
- [x] **T5.4** · A · T5.3 · `find_tools` meta-tool and hot-swap of tools mid-run.
  AC: scripted run where the needed tool isn't initially loaded and is found.
- [x] **T5.5** · A · T5.3 · Description shortening for small models (`short_description` use, override file).
  AC: token savings reported.
- [x] **T5.6** · A · T5.2 · Local model scheduler/lock: serialize local calls, group by model, unload policy, Gemini bypass.
  AC: mixed-task test counts swaps.
- [x] **T5.7** · E · T5.4 · 40-prompt tool-selection eval with ≥ 40 registered tools (use fixture tools).
  AC: ≥ 85% on qwen3.5:4b.

## Phase 6: Memory

- [x] **T6.1** · A · T0.4 · SQLite layer, migrations, schema from memory.md, `sqlite-vec` with a JS-cosine fallback.
- [x] **T6.2** · A · T6.1, T5.3 · Embedding service shared with tool retrieval, with batching.
- [x] **T6.3** · A · T6.2 · Write path: `remember` tool, dedup/supersede, secret detection, scopes.
- [x] **T6.4** · A · T6.2 · Read path: scoring, token cap, injection into the dynamic layer, privacy filtering for Gemini.
- [x] **T6.5** · A · T4.4 · Extraction at session end with a confirm checklist (`memory.confirm_extracted`).
- [x] **T6.6** · A · T3.2 · Working memory: `todo`, `scratch`, session persistence, `fam resume`, `history_search`.
- [x] **T6.7** · D · T6.3 · `/memory list|search|forget|export|import`, `fam memory wipe`.
- [x] **T6.8** · E · T6.4 · Memory eval cases and acceptance tests per memory.md section 9.
  AC (phase): all of memory.md section 9 passes.

## Phase 7: Office server (lane C)

- [x] **T7.1** · C · T0.9 · `servers/office` scaffold (TS, MCP SDK stdio), a shared file-safety layer (root confinement, working copy, backup, verify-by-reopen).
- [x] **T7.2** · C · T7.1 · Read tools: `docx_read` (outline and section), `xlsx_describe`, `xlsx_read_range`, `pptx_read`, `pdf_read`. All bounded and paginated.
  AC: fixture files, including large and messy ones.
- [x] **T7.3** · C · T7.2 · `xlsx_query_sql` (DuckDB/SQLite, read-only, row limit), a type inference step.
  AC: aggregation tests incl. dates and mixed types.
- [x] **T7.4** · C · T7.1 · xlsx write: `xlsx_write_cells`, `xlsx_add_formula`, `xlsx_add_sheet`, `xlsx_create_from_csv`.
- [x] **T7.5** · C · T7.1 · docx write: `docx_replace_text` (run-split safe), `docx_insert_paragraph`, `docx_add_table`, `docx_create_from_markdown`, `docx_apply_template`.
  AC: formatting preserved in tests (styles, runs).
- [x] **T7.6** · C · T7.1 · pptx: `pptx_create`, `pptx_add_slide`.
- [x] **T7.7** · C · T7.1 · LibreOffice manager: locate `soffice`, isolated profile dir, serialized queue, timeouts, `convert(path,to)`, `recalc(path)`, `render_preview(path,pages)` (via PDF to PNG).
  AC: conversion matrix test (doc↔docx, xls↔xlsx, odt/ods, pdf export).
- [x] **T7.8** · C · T7.4, T7.5, T7.7 · Annotations, tiers, dry-run previews and change summaries on all write tools; integrate with the executor's approval flow.
- [x] **T7.9** · C/E · T7.8 · ≥ 10 office evals. Automated "opens in LibreOffice without repair" check.
  AC: gate in plan.md.
- [x] **T7.10** · C · T7.8 · Fallback: a UNO-script runner tool for operations not covered (tier 3), documented.

## Phase 8: Sandbox and coding loop

- [ ] **T8.1** · B · T2.4 · Rust `sandbox` server: `run_command`, `run_code(lang)`, cpu/mem/time limits, workspace FS scope, env scrubbing, network off by default; OS isolation trait with Windows (Job Objects) and Linux (bubblewrap/landlock if available) impls plus a documented fallback.
  AC: tests for timeout, memory limit, output cap, and a network-denied check.
- [ ] **T8.2** · A · T8.1 · Project detection: test, lint, and format commands (package.json, Cargo.toml, pyproject, etc.).
- [ ] **T8.3** · A · T3.5 · Git checkpoint service: stash or temp branch before a task, `/undo`, `/diff`.
- [ ] **T8.4** · A · T1.3 · Coder-as-generator path: the prompt that returns only search/replace blocks, parser, retry on malformed output.
- [ ] **T8.5** · A · T8.2, T8.3, T8.4, T2.6 · Coding loop per architecture 4.8, with failure summarization (trim logs to the relevant lines), max N attempts, escalation hook.
- [ ] **T8.6** · D · T8.5 · Coder role UX: diff view, test status line, `/undo`.
- [ ] **T8.7** · E · T8.5 · ≥ 10 coding evals (fixture repos).
  AC: gate in plan.md.

## Phase 9: Planner, escalation, sub-agents

- [ ] **T9.1** · A · T5.2 · Plan schema and Gemini planner (structured output); local-only fallback planner using qwen3.5:4b.
- [ ] **T9.2** · A · T9.1, T3.2 · DAG executor: dependency resolution, concurrent ready nodes, result handles, node retries, partial-failure policy.
- [ ] **T9.3** · A · T5.6 · Escalation ladder with compacted state handoff, privacy re-check per hop, budget tracking per run (tokens, Gemini calls).
- [ ] **T9.4** · A · T9.2 · Verifier hooks per design 6, an optional critic pass for complexity ≥ 4.
- [ ] **T9.5** · A · T9.2 · Sub-agents and fan-out map-reduce with restricted tool subsets and budgets.
- [ ] **T9.6** · E · T9.5 · Multi-step evals and traces assertions.
  AC: gate in plan.md.

## Phase 10: Web and system tools

- [ ] **T10.1** · C · T0.9 · `web` server: `web_search` (pluggable provider), `fetch_markdown` (readability), `fetch_many` (parallel, rate-limited), PDF fetch. All outputs marked untrusted.
- [ ] **T10.2** · B/C · T0.9 · `system` server (decide the language in an ADR): clipboard, notify, open_app, sysinfo, screenshot; OS abstraction.
- [ ] **T10.3** · B/C · T10.2 · Reminders/timers with a persistent scheduler (survives restarts), delivered via notification.
- [ ] **T10.4** · D · T10.1 · Server presets (`fam mcp preset git|ffmpeg|calendar|email`) with the approval flow.
- [ ] **T10.5** · E · T10.3 · Everyday evals (≥ 8).
  AC: gate in plan.md.

## Phase 11: Evals, hardening, packaging

- [ ] **T11.1** · E · all · Expand to ≥ 30 evals, a per-model report, baselines, CI regression check.
- [ ] **T11.2** · E · T11.1 · Injection test pack (web page, doc, MCP description attacks) with pass criteria.
- [ ] **T11.3** · A · T11.1 · Chaos tests: server crash, Ollama down, Gemini 429/timeouts, disk full, huge outputs.
- [ ] **T11.4** · A · T9.3 · `fam serve` (the harness as an MCP server).
- [ ] **T11.5** · D · T11.1 · Installer/config wizard, README, user guide, `fam doctor` fixes.
- [ ] **T11.6** · E · T11.1 · Final prompt tuning per tier using eval results.
- [ ] **T11.7** · all · T11.* · Check the PRD success metrics. Document gaps.

## Backlog (not scheduled)
Voice I/O (whisper.cpp, TTS), a web UI, sampling/elicitation support, browser automation server, OCR, multi-profile configs, plugin marketplace.

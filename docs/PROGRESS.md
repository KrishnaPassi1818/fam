# Development Progress Log

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

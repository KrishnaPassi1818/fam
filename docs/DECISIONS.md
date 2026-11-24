# Architecture Decision Records (ADRs)

## ADR-001: Initial Architecture Baseline and Repository Setup
- **Date**: 2026-11-22
- **Status**: Accepted
- **Context**: Setting up `fam`, a local-first CLI AI agent harness running on Linux (Omarchy / Arch-based, AMD Ryzen 7 7435HS, NVIDIA RTX 4050 6GB VRAM, 24GB RAM).
- **Decision**:
  1. Monorepo structure using `pnpm` workspaces for TypeScript packages and Cargo workspace for Rust MCP servers.
  2. Local models managed via Ollama (`qwen2.5:1.5b` on CPU for router/compactor, `qwen3.5:4b` on GPU for general worker [superseding initial llama3.1:8b per ADR-005], `qwen2.5-coder:7b` on GPU for coding generator, `nomic-embed-text` for vector embeddings).
  3. Cloud model via Gemini API (`@google/genai`) for complex planning, long-context work, and escalation.
  4. Core contracts frozen in `packages/shared`.
- **Consequences**:
  - GPU VRAM (6GB) requires strict serialization between GPU models: `qwen3.5:4b` and `qwen2.5-coder:7b` must never co-load in VRAM.
  - Router (`qwen2.5:1.5b`) is pinned to CPU (`num_gpu: 0`).

## ADR-002: Contracts Frozen v1
- **Date**: 2026-11-22
- **Status**: Accepted
- **Context**: T0.2 requirement to freeze contracts in `packages/shared` so parallel lanes (Lane A Core, Lane B Rust, Lane C Office/Web, Lane D CLI/DX, Lane E Prompts/Evals, Lane F MCP host) can build independently without contract drift.
- **Decision**:
  1. `Message` schema frozen with roles `system`, `user`, `assistant`, `tool`. Discriminator is `role`.
  2. `ToolCall` and `ToolResult` frozen with synthetic ID support (`callId`), execution error flags, and taint labels (`normal` vs `local_only`).
  3. `ToolDescriptor` frozen with namespaced name (`server.tool`), model-safe alias (`[a-zA-Z0-9_]{1,64}`), annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`), and permission tiers (0-4).
  4. `ModelAdapter` interface frozen with `caps` flags (`tools`, `parallelTools`, `vision`, `jsonSchemaFormat`, `maxCtx`), async iterable streaming `chat(req, signal)`, token counting, and warm/unload hooks.
  5. Error taxonomy frozen with `FamError` base and typed subclasses: `ModelError`, `ToolValidationError`, `ToolExecError`, `PermissionDenied`, `PrivacyBlocked`, `BudgetExceeded`, `LoopDetected`.
  6. Shared logger with automatic secret redaction (Google API keys, OpenAI keys, GitHub tokens, Bearer tokens).
  7. Token estimator calibrated for local models and message framing overhead.
- **Consequences**:
  - Any future changes to `packages/shared` contracts within Phase 0-2 require an explicit ADR and must preserve backward compatibility.

## ADR-003: MCP Tool Naming, Alias Conventions, and Annotations Specification
- **Date**: 2026-11-22
- **Status**: Accepted
- **Context**: T0.9 requirement to establish rigid conventions for MCP tool discovery, namespacing, model-safe aliases, and execution annotations.
- **Decision**:
  1. **Canonical Naming**: Every MCP tool is identified internally by `<server_name>.<tool_name>`, where `<server_name>` matches the key in `config/servers.toml` and `<tool_name>` is the name returned by `tools/list`.
  2. **Model-Safe Aliases**: Small local models (Llama 3.1, Qwen 2.5) strictly require identifiers matching `^[a-zA-Z0-9_]{1,64}$`. Canonical names with dots (`.`) are mapped to aliases with underscores (`_`). If an alias collision occurs across servers, sequential suffixing (`_2`, `_3`) is deterministically applied and tracked in the MCP registry bridge.
  3. **Annotation Semantics**:
     - `readOnlyHint`: When true, signals to the Executor that calls may be scheduled concurrently in parallel batches (up to `maxParallelTools`, default 6). When false, the call requires sequential serialization.
     - `destructiveHint`: When true, flags an action that deletes or permanently overwrites state.
     - `idempotentHint`: When true, indicates that re-executing the call with identical arguments has no cumulative side-effects, enabling automatic retry on network/transport drops.
     - `openWorldHint`: When true, indicates the tool interacts with resources outside the local workspace.
  4. **Permission Tier Mapping**:
     - Tier 0: Read-only calls within workspace root (`readOnlyHint=true`, auto-approved).
     - Tier 1: Workspace modifications with auto-backup and undo capability (`fs.write_file`, `fs.apply_edit`).
     - Tier 2: Outside-workspace writes, overwrites of existing user documents, or file trash actions (requires approval prompt with preview).
     - Tier 3: Shell command execution, package installation, process control (`sandbox.run_command`, requires command preview approval).
     - Tier 4: Irreversible destructive operations (e.g. permanent deletion, `git push --force`, requires typed confirmation).
- **Consequences**:
  - The Executor and MCP host rely on these frozen conventions to enforce security and schedule parallel reads.

## ADR-004: TUI Architecture Redesign — Replacing Ink with Rust Ratatui
- **Date**: 2026-11-23
- **Status**: Accepted
- **Context**: The terminal user interface was originally implemented using `ink` (React for terminal in Node.js). While convenient for initial prototyping, Ink incurs heavy runtime overhead (V8 React reconciler, JSX layout calculations), displays visual flickering during high-speed token streaming, and introduces complex Node-specific terminal hook quirks. Replacing Ink with Rust `ratatui` (and `crossterm`) provides native double-buffering, flicker-free differential rendering, zero-allocation layout passes, robust terminal lifecycle handling, and decoupling of UI presentation from core agent loop execution.
- **Decision**:
  1. **New Rust Crate (`crates/fam-tui`)**: Built in the Cargo workspace with `ratatui 0.30` and `crossterm 0.29`. It implements the interactive terminal frontend (header, scrollable conversation history, tool calls, animated spinners, prompt input line with history, status bar with color-coded badges, and centered approval modal dialog).
  2. **Decoupled JSON Lines IPC Protocol**: Defines a strict bidirectional protocol between the TypeScript harness core and the Rust Ratatui frontend:
     - `ToTuiMessage`: `init`, `message`, `chunk`, `tool_call`, `tool_result`, `status`, `warning`, `approval_request`, `finish`, `error`, `clear`, `exit`.
     - `FromTuiMessage`: `user_input`, `approval_decision`, `interrupt`, `exit`.
  3. **Headless Harness & Bridge**: `@fam/cli` implements `SessionDriver` and `ratatui-bridge.ts`. In interactive mode, `fam` launches `fam-tui` (or `fam-tui` spawns `fam --headless`), streaming agent execution events over stdio. One-shot mode (`fam "prompt"`) executes directly in the terminal without full-screen mode.
  4. **Dependency Removal**: Removed `ink`, `ink-spinner`, `ink-text-input`, `ink-testing-library`, `react`, and `@types/react` from `@fam/cli`.
- **Consequences**:
  - The CLI package `@fam/cli` is now pure TypeScript with zero React dependencies.
  - Interactive terminal performance is vastly superior with zero flicker during token streaming and strict signal abort handling (`Esc` interrupt).
  - TUI can be tested independently in Rust using `ratatui::backend::TestBackend` and in TypeScript via the IPC session driver.

## ADR-005: Primary Local GPU Worker Migration from Llama 3.1 8B to Qwen 3.5 4B
- **Date**: 2026-11-24
- **Status**: Accepted
- **Context**: The primary local worker model was originally `llama3.1:8b`. While functional, running `llama3.1:8b` (4.9 GB weights) with an 8,192 context window pushed GPU VRAM consumption to ~4,011 MB and resulted in partial offloading (27/33 layers on GPU, 6 layers spilled to CPU) on the RTX 4050 6GB GPU. Migrating to `qwen3.5:4b` (`d8b0f5e9760c`, 3.1 GB weights) allows 100% GPU offloading with 4,096 context window, native function tool calling, vision support via clip projector, faster generation speeds (25.6+ tok/s), and zero CPU layer spill.
- **Decision**:
  1. Replace all footprints and configurations of `llama3.1:8b` with `qwen3.5:4b`.
  2. Set `qwen3.5:4b` as default assistant model in `config/default.toml`, `config/models.toml`, `config/routing.toml`, and user configuration `~/.fam/`.
  3. Context window calibrated to 4096 tokens (`numCtx = 4096`) with 100% GPU offload on llamacpp runner.
  4. Prompt profile migrated: `prompts/profiles/llama3.md` deleted and replaced with `prompts/profiles/qwen35.md`.
  5. Updated `fam doctor` diagnostic suite, model scheduler locks, context budgeter tables, test suites, and documentation across all packages.
- **Consequences**:
  - 100% GPU placement without CPU layer spill or thermal throttling.
  - Zero co-loading interference with `qwen2.5-coder:7b` as both cleanly fit under 6GB VRAM bounds when scheduled.
  - All test suites and prompt budget checks pass cleanly with new model defaults.





# Architecture Decision Records (ADRs)

## ADR-001: Initial Architecture Baseline and Repository Setup
- **Date**: 2026-11-22
- **Status**: Accepted
- **Context**: Setting up `hx`, a local-first CLI AI agent harness running on Linux (Omarchy / Arch-based, AMD Ryzen 7 7435HS, NVIDIA RTX 4050 6GB VRAM, 24GB RAM).
- **Decision**:
  1. Monorepo structure using `pnpm` workspaces for TypeScript packages and Cargo workspace for Rust MCP servers.
  2. Local models managed via Ollama (`qwen2.5:1.5b` on CPU for router/compactor, `llama3.1:8b` on GPU for general worker, `qwen2.5-coder:7b` on GPU for coding generator, `nomic-embed-text` for vector embeddings).
  3. Cloud model via Gemini API (`@google/genai`) for complex planning, long-context work, and escalation.
  4. Core contracts frozen in `packages/shared`.
- **Consequences**:
  - GPU VRAM (6GB) requires strict serialization between 7B/8B models: `llama3.1:8b` and `qwen2.5-coder:7b` must never co-load in VRAM.
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
  5. Error taxonomy frozen with `HxError` base and typed subclasses: `ModelError`, `ToolValidationError`, `ToolExecError`, `PermissionDenied`, `PrivacyBlocked`, `BudgetExceeded`, `LoopDetected`.
  6. Shared logger with automatic secret redaction (Google API keys, OpenAI keys, GitHub tokens, Bearer tokens).
  7. Token estimator calibrated for local models and message framing overhead.
- **Consequences**:
  - Any future changes to `packages/shared` contracts within Phase 0-2 require an explicit ADR and must preserve backward compatibility.


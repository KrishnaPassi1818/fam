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

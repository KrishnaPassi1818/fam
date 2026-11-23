# 📚 hx Documentation Hub

Welcome to the comprehensive documentation repository for **`hx`**, the local-first CLI AI agent harness. This hub indexes all specifications, architectural blueprints, user manuals, and technical references.

---

## 🗂 Documentation Map

```
docs/
├── README.md               # You are here: Documentation Index & Hub
│
├── 🚀 User Guides
│   ├── getting-started.md  # Complete setup, installation, and first-steps tutorial
│   ├── cli.md              # Complete CLI commands, options, and TUI manual
│   └── configuration.md    # Configuration reference for ~/.harness/*.toml
│
├── 🏛 Architecture & Design
│   ├── architecture.md     # System architecture, process view, component contracts
│   ├── design.md           # UX design, prompt layering, tool guidelines, verification
│   ├── mcp.md              # Model Context Protocol (MCP) host & server implementation
│   ├── memory.md           # SQLite vector memory, working memory, and decay logic
│   └── rules.md            # Non-negotiable security, coding, prompt, and operating rules
│
├── 📜 Governance & Progress
│   ├── prd.md              # Product Requirements Document
│   ├── DECISIONS.md        # Architecture Decision Records (ADR-001 to ADR-004)
│   ├── plan.md             # Multi-phase roadmap, dependency graph, and risk gates
│   ├── tasks.md            # Granular task tracking per phase (P0 through P11)
│   └── PROGRESS.md         # Chronological progress log, benchmark records, and exit gates
│
└── 🔬 Prompts & Reference
    └── reference/
        └── prompt-analysis.md # Distillation analysis of the reference prompt
```

---

## 🧭 Document Summaries

### 1. User & Developer Guides

- **[Getting Started Guide](getting-started.md)**:
  Prerequisites, dependency verification, local model pulling via Ollama, environment validation with `hx doctor`, interactive Ratatui TUI sessions, one-shot commands, and 5 hands-on walkthroughs.
- **[CLI & TUI Manual](cli.md)**:
  Comprehensive reference for the `hx` binary. Covers all flags (`--model`, `--role`, `--system`, `--local-only`, `-y`), subcommands (`doctor`, `eval`, `mcp`, `memory`, `replay`, `trace`), interactive Ratatui TUI navigation, and slash commands.
- **[Configuration Reference](configuration.md)**:
  Deep-dive into the configuration system (`~/.harness/`). Explains `default.toml`, `models.toml`, `policy.toml` (permission tiers), `privacy.toml` (entropy and path filters), `routing.toml` (fast-path rules & cascades), and `servers.toml`.
- **[MCP Integration Guide](mcp.md)**:
  Guide to extending `hx` through the Model Context Protocol. Details the stdio and HTTP/SSE host, alias sanitization, annotations, built-in servers (`fs`, `sandbox`, `office`, `web`), and connecting custom third-party MCP servers.

### 2. Architecture & System Specifications

- **[System Architecture](architecture.md)**:
  Covers the 6 core principles, process layout, monorepo organization, TypeScript/Rust boundary, model adapters (`OllamaAdapter`, `GeminiAdapter`), agent loop lifecycle, and parallel execution engine.
- **[System Design](design.md)**:
  Details UX design, terminal layout, 6-layer system prompt builder, AJV schema validation with automatic repair, 5-tier permission gates, in-memory SQL on spreadsheets, and verification strategies.
- **[Memory Specification](memory.md)**:
  Detailed blueprint for persistent long-term memory: SQLite database with `sqlite-vec` embeddings, cosine ranking with recency decay, contradiction superseding, working memory (`/todo`, 2KB scratchpad), and session persistence.
- **[Operating Rules & Security](rules.md)**:
  The non-negotiable rules governing agent behavior, TypeScript and Rust coding standards, testing requirements, security fences, prompt budgets, and definition of done.

### 3. Decisions, Milestones & Roadmap

- **[Architecture Decision Records (ADRs)](DECISIONS.md)**:
  Formal logs of critical architectural choices:
  - `ADR-001`: Initial Architecture Baseline and Repository Setup
  - `ADR-002`: Contracts Frozen v1 in `packages/shared`
  - `ADR-003`: MCP Tool Naming, Alias Conventions, and Annotations
  - `ADR-004`: TUI Architecture Redesign — Replacing Ink with Rust Ratatui
- **[Development Plan](plan.md)**:
  Strategic phased roadmap (Phases 0 through 11), parallelization guidance across Lanes A through F, dependency graph, and risk checkpoints.
- **[Task Tracker](tasks.md)**:
  Granular task checklist with acceptance criteria covering all phases.
- **[Development Progress Log](PROGRESS.md)**:
  Real-time engineering log containing benchmark measurements, hardware telemetry, phase exit gate verification runs, and bugfix analyses.

---

## ⚡ Quick Navigation

| If you want to...                              | Read this first                                                     |
| :--------------------------------------------- | :------------------------------------------------------------------ |
| Install and run `hx` on your machine           | [Getting Started Guide](getting-started.md)                         |
| Learn interactive slash commands & keybindings | [CLI & TUI Manual](cli.md)                                          |
| Connect a new custom MCP server                | [MCP Integration Guide](mcp.md)                                     |
| Configure permission tiers or model placement  | [Configuration Reference](configuration.md)                         |
| Understand how local 8B models act reliably    | [System Architecture](architecture.md) & [System Design](design.md) |
| Review benchmark results & hardware metrics    | [Development Progress Log](PROGRESS.md)                             |

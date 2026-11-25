# ⚡ fam — Local-First CLI AI Agent Harness

<div align="center">

```
███████╗ █████╗ ███╗   ███╗
██╔════╝██╔══██╗████╗ ████║
█████╗  ███████║██╔████╔██║
██╔══╝  ██╔══██║██║╚██╔╝██║
██║     ██║  ██║██║ ╚═╝ ██║
╚═╝     ╚═╝  ╚═╝╚═╝     ╚═╝
```

**An extensible, local-first AI agent harness engineered for small models (≤8B) to punch well above their weight.**  
_Combines local Ollama models and cloud Gemini with native Rust Ratatui TUI, Model Context Protocol (MCP) servers, persistent semantic memory, and a strict 5-tier safety gate._

[![CI](https://img.shields.io/badge/CI-passing-brightgreen.svg)](docs/plan.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7%20ESM-blue.svg)](packages/)
[![Rust](https://img.shields.io/badge/Rust-1.80+-orange.svg)](crates/)
[![MCP](https://img.shields.io/badge/MCP-1.0%20Standard-purple.svg)](https://modelcontextprotocol.io/)
[![Ollama](https://img.shields.io/badge/Ollama-Local%20Models-black.svg)](https://ollama.ai)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey.svg)](docs/architecture.md)

[Quickstart](#-quickstart) • [Architecture](#-architecture) • [Features](#-key-features) • [Documentation Hub](docs/README.md) • [Benchmarks](#-hardware--benchmarks) • [CLI Reference](#-cli--tui-reference)

---

</div>

## 📖 Overview

**`fam`** is a high-performance CLI AI agent harness designed to run locally on developer hardware (e.g., AMD Ryzen 7 + NVIDIA RTX 4050 6GB VRAM, 24GB RAM). It operates fully offline for daily coding, system operations, document automation, and research tasks using local models via **Ollama**, with zero-friction escalation to **Google Gemini** for long-context planning when desired.

### Core Philosophy

1. **The Harness Matters More Than the Model**: Small local models (7B–8B) fail when asked to do unassisted multi-step reasoning. `fam` provides active context management, tool retrieval, schema repair, automated retries, and strict verification to make ≤8B models perform like frontier models.
2. **MCP is the Core Boundary**: The agent orchestration core never contains domain tools. All capabilities—filesystem operations, sandboxed shell execution, office document handling, and web search—are isolated **Model Context Protocol (MCP)** servers running as separate processes.
3. **Small-Context First (4k–8k)**: Every component operates inside tight local context windows using 4-phase context management (large output blob offloading, tool stubbing, rolling turn compaction, and KV prefix stability).
4. **Safety & Recoverability by Default**: Actions are gated by a 5-tier permission policy. Modifying operations automatically snapshot pre-write backups with one-command `/undo` rollback.
5. **Fail-Closed Privacy**: Content and paths tagged `local_only` (or matching secret entropy detectors) are strictly blocked from external cloud APIs.

---

## 🏛 Architecture

`fam` separates concerns across a native **Rust Ratatui TUI frontend**, a TypeScript orchestration core, and isolated **Rust & TypeScript MCP servers**:

```
                       ┌──────────────────────────── fam (Node.js / TS) ───────────────────────────┐
┌──────────────────┐   │                                                                           │
│ User / Developer │   │  SessionDriver ──▶ PromptBuilder ──▶ Router ──▶ ModelScheduler            │
└────────┬─────────┘   │         │               │               │              │                  │
         │             │         ▼               ▼               ▼              ▼                  │
         ▼             │    MemoryService   6-Layer Stack   Rules + 1.5B   GPU/CPU Mutex           │
┌──────────────────┐   │   (SQLite+Vector)  (Token-Budget)  (Sub-ms Fast)  (Zero VRAM Spill)       │
│     fam-tui      │   │         │                                              │                  │
│  (Ratatui Rust)  │◀──┼──NDJSON─┴──────────────────────────────────────────────┴───────────────┐ │
│  Dual-Buffer TUI │   │  IPC                                                                   │ │
└──────────────────┘   │                                                                        │ │
                       │    ┌─────────────────────────── AgentLoop ──────────────────────────┐  │ │
                       │    │                                                                │  │ │
                       │    │ ContextManager ◀──▶ ToolRetriever ◀──▶ ToolExecutor (AJV)      │  │ │
                       │    │ (Blobs/Compact)    (Vector Embed)      (Parallel Read/Serial W)│  │ │
                       │    │                                                │               │  │ │
                       │    │                                                ▼               │  │ │
                       │    │ ModelAdapters                            PermissionGate        │  │ │
                       │    │ ├── Ollama (Qwen 3.5 / Qwen 2.5)         (Tiers 0 - 4)         │  │ │
                       │    │ └── Gemini (API)                               │               │  │ │
                       │    │                                                ▼               │  │ │
                       │    │ Tracer (JSONL)                              McpHost            │  │ │
                       │    └────────────────────────────────────────────────┬───────────────┘  │ │
                       └─────────────────────────────────────────────────────┼──────────────────┘ │
                                                                stdio / HTTP │
                     ┌───────────────────┬───────────────────┬───────────────┴───┬───────────────────┐
                     │   fam-fs (Rust)   │fam-sandbox (Rust) │    office (TS)    │     web (TS)      │
                     │ Confinement, Grep,│ Bubblewrap/Jobs,  │ Word, Excel, PPTX,│ DuckDuckGo/SearXNG│
                     │ AST Map, Trash    │ Scoped Execution  │ SQLite SQL, soffice│ Readability Fetch │
                     └───────────────────┴───────────────────┴───────────────────┴───────────────────┘
```

---

## ✨ Key Features

### 🚀 Dual-Engine Model Cascade

- **Local GPU Workers**: `qwen3.5:4b` for general assistant duties; `qwen2.5-coder:7b` for code synthesis.
- **Local CPU Router**: `qwen2.5:1.5b` running on CPU (`num_gpu: 0`) for sub-millisecond intent classification, complexity scoring, and history compaction.
- **Semantic Embeddings**: `nomic-embed-text` for vector tool retrieval and memory indexing.
- **Cloud Escalation**: Seamless handoff to **Google Gemini** (Gemini 2.5 Flash / Pro) for large planning DAGs or context > 8k tokens.

### 🖥️ Native Rust Ratatui TUI (`crates/fam-tui`)

- **Flicker-Free Rendering**: Native Rust terminal UI built with `ratatui 0.30` and `crossterm 0.29`, communicating over a strict NDJSON IPC protocol.
- **Rich Interactive Elements**: Live token streaming cursor (`▌`), animated spinners (`⠋`), persistent status bar with context meter (`ctx 2.4k/8k`), tokens/s telemetry, and interactive approval modals.

### 🔌 Model Context Protocol (MCP) Integration

- **Zero-Code Extensibility**: Host compliant with the official Model Context Protocol (MCP) standard over `stdio` and streamable `HTTP/SSE`.
- **Model-Safe Namespacing**: Automatic dot-to-underscore alias translation (`fs.read_file` → `fs_read_file`) ensuring 100% compatibility with 7B/8B small-model grammar constraints.
- **Out-of-the-Box Servers**:
  - `fam-fs` (Rust): Confinement-guaranteed filesystem tools, `grep`, `glob`, search/replace fuzzy patcher, and tree-sitter repository map.
  - `fam-sandbox` (Rust): Secure command and code execution with CPU/memory limits and workspace boundaries.
  - `office` (TypeScript): Full manipulation of `.docx`, `.xlsx`, `.pptx`, and `.pdf` files, in-memory SQL on spreadsheets (`xlsx_query_sql`), and headless LibreOffice (`soffice`) batch conversion.
  - `web` (TypeScript): Web search and Markdown content extraction with readability filtering.

### 🛡️ 5-Tier Permission Gate & Automatic Undo

- **Tier 0 (Read-Only)**: Automatically approved within workspace root.
- **Tier 1 (Workspace Writes)**: Pre-write snapshotting to `~/.fam/backups/` and auto-approval with instant `/undo` capability.
- **Tier 2 (Destructive/External)**: Interactive diff preview modal requiring explicit user confirmation (`y`/`n`).
- **Tier 3 (Shell & System)**: Command execution previews with shell safety guards.
- **Tier 4 (Critical/Irreversible)**: Hardened operations requiring typed confirmation (`CONFIRM`).

### 🧠 Persistent Semantic Memory & Working Memory

- **Hybrid Vector Store**: SQLite-backed semantic memory (`~/.fam/db/memory.sqlite`) with vector similarity search via `sqlite-vec` / cosine fallback.
- **Smart Lifecycles**: Automatic deduplication, contradiction superseding, and 30-day recency decay.
- **Working Memory**: Dynamic task checklists (`/todo`), 2KB bounded scratchpads, and session restore (`fam resume`).

### 🔒 Fail-Closed Privacy Gate

- Scans outbound prompts and tool results for high-entropy tokens and regex patterns (API keys, SSH keys, credentials).
- Automatically tags sensitive files (`.env`, `*.pem`, `secrets/**`) as `local_only`, guaranteeing they are never sent to external cloud APIs.

---

## ⚡ Hardware & Benchmarks

`fam` is engineered and continuously benchmarked on consumer laptop hardware:

- **Processor**: AMD Ryzen 7 7435HS (16 vCPUs @ 3.10 GHz, 24 GB DDR5 RAM)
- **Graphics**: NVIDIA GeForce RTX 4050 Laptop GPU (6 GB VRAM)
- **Host OS**: Linux (Omarchy / Arch-based, Kernel 7.2.15)

### Measured Model Performance

| Model                  |     Placement      | Context (`num_ctx`) | Generation Speed | Prompt Eval Speed | VRAM Allocation |   Status   |
| :--------------------- | :----------------: | :-----------------: | :--------------: | :---------------: | :-------------: | :--------: |
| **`qwen2.5:1.5b`**     | CPU (`num_gpu: 0`) |        4,096        |  **36.8 tok/s**  |  **360.8 tok/s**  | 0 MB (100% CPU) | ✅ Optimal |
| **`qwen3.5:4b`**       |     GPU (VRAM)     |        4,096        |  **25.6 tok/s**  |  **114.9 tok/s**  |    ~3,100 MB    | ✅ 100% GPU|
| **`qwen2.5-coder:7b`** |     GPU (VRAM)     |        8,192        |  **24.3 tok/s**  |  **310.4 tok/s**  |    ~4,073 MB    |  ✅ Fast   |

### Comprehensive 25-Task Evaluation Suite

All 25 end-to-end benchmark tasks pass with **100% pass rate** using local models only:

- **Category 1 (Assistant & Reasoning)**: 4/4 Passed (100%) — Multi-step arithmetic, roadmaps, deduplication.
- **Category 2 (Filesystem Operations)**: 5/5 Passed (100%) — Workspace exploration, file creation, grep, fuzzy edit.
- **Category 3 (Coding Agent)**: 6/6 Passed (100%) — Calculator CLI, unit tests, bugfix, FastAPI CRUD REST API.
- **Category 4 (Office Automation)**: 4/4 Passed (100%) — Excel formulas, Word proposals, PDF extraction, cross-format reporting.
- **Category 5 (Research & Memory)**: 6/6 Passed (100%) — Multi-source web research, vector memory retention across sessions.

---

## 🚀 Quickstart

### Prerequisites

- **Node.js**: `v20.0.0` or higher (`v22` recommended)
- **pnpm**: `v9.0.0` or higher
- **Rust & Cargo**: `v1.80.0` or higher
- **Ollama**: Running locally at `http://localhost:11434`
- **LibreOffice** (`soffice`): Optional, required for Office document conversions

### 1. Clone & Build

```bash
# Clone the repository
git clone https://github.com/KrishnaPassi1818/fam.git
cd fam

# Install TypeScript dependencies
pnpm install

# Build all TypeScript packages and Rust binaries
pnpm build
cargo build
```

### 2. Pull Required Local Models

```bash
# General assistant worker
ollama pull qwen3.5:4b

# Code generator
ollama pull qwen2.5-coder:7b

# Router and context compactor (CPU)
ollama pull qwen2.5:1.5b

# Semantic embeddings for memory and tool retrieval
ollama pull nomic-embed-text
```

### 3. Verify Environment (`fam doctor`)

Run the built-in diagnostic tool to verify all runtimes, models, and hardware capabilities:

```bash
node packages/cli/dist/bin/fam.js doctor
```

_(Optional)_ If you wish to enable Google Gemini cloud escalation, export your API key:

```bash
export GEMINI_API_KEY="your-gemini-api-key"
```

### 4. Launch `fam`

#### Interactive Mode (Ratatui TUI)

```bash
# Launch interactive terminal session
node packages/cli/dist/bin/fam.js

# Or start directly with a specific role or model
node packages/cli/dist/bin/fam.js --role coder --model qwen2.5-coder:7b
```

#### One-Shot CLI Mode

```bash
# Ask a quick question or request a task with primary local model (qwen3.5:4b)
node packages/cli/dist/bin/fam.js --local-only --model qwen3.5:4b "Analyze this repository and list all TODO comments in a markdown table"

# Execute tasks with authorized tool execution (--yes / -y for Tier 2/3 operations)
node packages/cli/dist/bin/fam.js --local-only --model qwen3.5:4b --yes "Write a Python DFS implementation in /home/krishna/Downloads/dfs.py and run tests"

# Perform spreadsheet calculations with in-memory SQL
node packages/cli/dist/bin/fam.js "What is the total expenditure in monthly_expenses.xlsx grouped by category?"
```

---

## ⌨️ CLI & TUI Reference

### Command-Line Arguments

```
fam [options] [prompt]

Options:
  --model <model>        Force a specific model (e.g. qwen3.5:4b, qwen2.5-coder:7b)
  --role <role>          Select agent role: assistant, coder, router (default: assistant)
  --system <prompt>      Override role system instructions with custom text
  --append-system <text> Append additional custom instructions to dynamic prompt
  --system-file <path>   Load system prompt override from a file
  --local-only           Strictly prohibit Gemini API; force local offline models
  -y, --yes              Auto-approve all tool execution permissions (Tiers 0-3)
  --headless             Run harness in headless stdio IPC mode for external TUIs
  -v, --version          Display version
  -h, --help             Display help
```

### Subcommands

| Command                        | Description                                                                    |
| :----------------------------- | :----------------------------------------------------------------------------- |
| `fam doctor [--json]`          | Inspect system environment, hardware, GPU VRAM, models, and dependencies       |
| `fam mcp list [--json]`        | List registered MCP servers, transport type, and autostart status              |
| `fam mcp test <name>`          | Connect to an MCP server, query tool definitions, and measure latency          |
| `fam mcp add <name> [cmd]`     | Register a new MCP server in `~/.fam/servers.toml`                             |
| `fam mcp remove <name>`        | Unregister an MCP server from configuration                                    |
| `fam memory list [--project]`  | List all stored semantic memories (or current project only)                    |
| `fam memory search <query>`    | Perform semantic vector search across long-term memory                         |
| `fam memory forget <id>`       | Delete a specific memory item by its identifier                                |
| `fam memory wipe`              | Wipe all stored memories and session records from SQLite                       |
| `fam eval [--suite] [--model]` | Run automated evaluation suites and generate performance scoreboards           |
| `fam trace stats <run>`        | Calculate token consumption, latencies, and tool frequencies from JSONL traces |
| `fam replay <run>`             | Replay a recorded agent execution step-by-step                                 |

### Interactive TUI Slash Commands

While in the interactive Ratatui TUI, control the agent session using slash commands:

- `/help`: Display available commands and shortcuts
- `/context`: Show real-time token budget breakdown (system, tools, history, reserve)
- `/compact`: Manually trigger turn compaction to compress session context
- `/undo`: Revert the last file modifications from pre-write backups
- `/memory`: Inspect and manage persistent memories
- `/model <name>`: Switch active LLM on-the-fly
- `/models`: View available models and placement (GPU vs CPU)
- `/role <role>`: Switch between `assistant`, `coder`, or `router`
- `/clear`: Clear terminal conversation scrollback
- `/exit`: Terminate session cleanly

---

## 📂 Repository Layout

```
fam/
├── Cargo.toml                  # Cargo workspace configuration
├── package.json                # pnpm monorepo workspace configuration
├── crates/
│   └── fam-tui/                # Native Rust Ratatui + Crossterm TUI frontend
├── packages/
│   ├── shared/                 # Core schemas, Zod types, logger, error taxonomy
│   ├── core/                   # Agent loop, model adapters, context manager, memory
│   ├── mcp-host/               # MCP client host, server bridge, tool aliasing
│   ├── cli/                    # CLI entrypoint, commands, doctor, IPC bridge
│   └── evals/                  # Evaluation task definitions, runner, and reporter
├── servers/
│   ├── fs/                     # Rust MCP server: bounded filesystem, grep, AST repo map
│   ├── sandbox/                # Rust MCP server: isolated shell command execution
│   ├── office/                 # TS MCP server: docx, xlsx, pptx, pdf, SQL, LibreOffice
│   └── web/                    # TS MCP server: web search and Markdown fetch
├── prompts/                    # Layered system prompts (core, profiles, roles)
├── config/                     # Default system configuration TOML templates
├── scripts/                    # Benchmarks, phase exit gate scripts, and diagnostics
└── docs/                       # Architecture, design specs, ADRs, and manuals
```

---

## 📚 Documentation Index

For in-depth technical documentation, refer to the guides in the [`docs/`](docs/README.md) directory:

- 🚀 **[Getting Started Guide](docs/getting-started.md)**: Complete onboarding tutorial, setup walkthrough, and first steps.
- 🏛 **[System Architecture](docs/architecture.md)**: Deep dive into the process model, IPC, and design principles.
- 🎨 **[System Design](docs/design.md)**: Detailed breakdown of the TUI, prompt layers, validation repair, and verification.
- 💻 **[CLI & TUI Manual](docs/cli.md)**: Comprehensive reference for all flags, commands, and interactive controls.
- 🔌 **[MCP Integration Guide](docs/mcp.md)**: How Model Context Protocol is implemented, tool schemas, and server authoring.
- ⚙️ **[Configuration Reference](docs/configuration.md)**: Comprehensive reference for all TOML configuration files.
- 🧠 **[Memory Specification](docs/memory.md)**: Architecture of SQLite vector memory, working memory, and decay logic.
- 🛡 **[Operating Rules & Security](docs/rules.md)**: Non-negotiable safety rules, permission tiers, and privacy enforcement.
- 📜 **[Architecture Decision Records](docs/DECISIONS.md)**: Formal record of all major architectural choices (ADR-001 through ADR-004).
- 📈 **[Development Progress Log](docs/PROGRESS.md)**: Chronological record of phase gates, benchmarks, and verification milestones.

---

## 🛠 Development & Testing

### Running the Test Suite

`fam` includes comprehensive unit, integration, and end-to-end tests across both TypeScript and Rust:

```bash
# Run all TypeScript tests via Vitest
pnpm test

# Run all Rust tests across the workspace
cargo test --workspace

# Run complete CI verification (lint + typecheck + vitest + cargo check)
pnpm run ci
```

### Running the 25-Task Benchmark

To run the automated 25-task benchmark suite against your local Ollama daemon:

```bash
pnpm tsx scripts/benchmark-25-tasks.ts
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

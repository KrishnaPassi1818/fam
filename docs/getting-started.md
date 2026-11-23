# 🚀 Getting Started with fam

This guide will walk you through setting up, configuring, and using **`fam`**, the local-first CLI AI agent harness.

---

## 📋 System Prerequisites

`fam` is designed to run locally on developer laptops and workstations.

### Required Software

1. **Operating System**: Linux (recommended, e.g. Arch/Omarchy/Ubuntu), macOS, or Windows via WSL2.
2. **Node.js**: `v20.0.0` or higher (`v22` LTS recommended). Verify with `node -v`.
3. **pnpm**: `v9.0.0` or higher (`v12` recommended). Verify with `pnpm -v`.
4. **Rust & Cargo**: `v1.80.0` or higher. Verify with `rustc --version` and `cargo --version`.
5. **Ollama**: Running locally as a background service (`http://localhost:11434`). Verify with `ollama --version`.
6. **Git**: `git` installed and accessible in `$PATH`.

### Optional Software

- **NVIDIA GPU**: RTX 3050/4050 or higher with ≥ 6 GB VRAM for accelerated local inference. (CPU inference works automatically as a fallback).
- **LibreOffice (`soffice`)**: Required for headless document conversion (`.doc` ↔ `.docx`, `.xlsx` ↔ `.pdf`, formula recalculation).
- **Google Gemini API Key**: Optional. Required only if you wish to enable cloud escalation for large DAG planning or contexts > 8,192 tokens.

---

## 📥 Installation & Setup

### 1. Clone the Monorepo

```bash
git clone https://github.com/KrishnaPassi1818/fam.git fam
cd fam
```

### 2. Install TypeScript Dependencies

```bash
pnpm install
```

### 3. Build Packages and Rust Binaries

Compile the TypeScript monorepo packages (`@fam/shared`, `@fam/core`, `@fam/mcp-host`, `@fam/cli`, `@fam/evals`, `servers/office`, `servers/web`) and the Cargo workspace (`fam-fs`, `fam-sandbox`, `crates/fam-tui`):

```bash
pnpm build
cargo build
```

---

## 🤖 Setting Up Local Models

`fam` relies on a tiered multi-model architecture. Pull the required models using Ollama:

```bash
# 1. General Assistant Worker (Runs in GPU VRAM)
ollama pull llama3.1:8b

# 2. Dedicated Code Generator (Runs in GPU VRAM)
ollama pull qwen2.5-coder:7b

# 3. Fast Intent Router & Compactor (Pinned to CPU, zero VRAM usage)
ollama pull qwen2.5:1.5b

# 4. Semantic Vector Embeddings (Used for tool retrieval and long-term memory)
ollama pull nomic-embed-text
```

---

## 🩺 Verifying Your Environment (`fam doctor`)

Run the built-in diagnostic tool to confirm that your hardware, runtimes, models, and tools are properly configured:

```bash
node packages/cli/dist/bin/fam.js doctor
```

Sample output:

```
=== fam doctor environment inspection ===

STATUS   | COMPONENT                | DETAILS
--------------------------------------------------------------------------------
[ PASS ] | Operating System         | Linux (x64)
[ PASS ] | User Shell               | /usr/bin/bash
[ PASS ] | CPU & RAM                | AMD Ryzen 7 (16 cores), 24 GB RAM
[ PASS ] | Node.js                  | v22.x (Node >= 20 required)
[ PASS ] | pnpm                     | v12.x
[ PASS ] | Rust & Cargo             | rustc 1.98+ / cargo 1.98+
[ PASS ] | NVIDIA GPU & VRAM        | NVIDIA RTX 4050 (6141MiB total)
[ PASS ] | Ollama Service           | Connected. Available models: llama3.1:8b, qwen2.5:1.5b...
[ PASS ] | Ollama Models            | All target models present
[ PASS ] | LibreOffice (soffice)    | LibreOffice installed
[ PASS ] | Git                      | git version 2.x
--------------------------------------------------------------------------------
Verdict: All required dependencies are satisfied.
```

---

## 🎯 First Steps & Usage Modes

### Mode 1: Interactive Terminal Mode (Ratatui TUI)

Launch the full-screen terminal interface:

```bash
node packages/cli/dist/bin/fam.js
```

Features in TUI Mode:

- **Streaming markdown output** with an active cursor indicator (`▌`).
- **Collapsible tool lines** showing execution status and elapsed time (`⚙ fs_grep ... (12ms)`).
- **Status Bar** displaying current model, context meter (`ctx 2.1k/8k`), tier, generation speed (`tok/s`), and placement badge (`LOCAL`).
- **Approval Modals** when actions require user authorization.

### Mode 2: One-Shot Command Execution

Run a prompt directly from the shell without opening the TUI:

```bash
node packages/cli/dist/bin/fam.js "List the 5 most recently modified files in this repository"
```

To automatically approve tool executions in non-interactive pipelines, pass `-y` / `--yes`:

```bash
node packages/cli/dist/bin/fam.js -y "Check git status and summarize modified files"
```

---

## 📚 Hands-On Tutorials

### Tutorial 1: General Assistant & Reasoning

Ask `fam` to perform multi-step planning or structured math:

```bash
node packages/cli/dist/bin/fam.js "I have a monthly budget of ₹5000. I spent ₹1200 on groceries, ₹800 on transit, and ₹1000 on bills. How much do I have left, and what is my daily budget for the remaining 30 days?"
```

_`fam` will utilize its built-in arithmetic grounding tools to compute the exact figures without hallucination._

### Tutorial 2: Repository Exploration & Coding

Switch to the specialized coding role:

```bash
node packages/cli/dist/bin/fam.js --role coder "Explore the src/ directory of packages/core and explain how ContextManager prevents context overflow"
```

_`fam` uses `fs_repo_map` (Tree-sitter AST extraction) and `fs_grep` to inspect symbols and files with minimal token consumption._

### Tutorial 3: Spreadsheet Analysis with In-Memory SQL

Given an Excel sheet (`data/expenses.xlsx`), query it directly using SQL:

```bash
node packages/cli/dist/bin/fam.js "In data/expenses.xlsx, what is the total amount spent grouped by category, ordered from highest to lowest?"
```

_`fam` invokes the `office` MCP server, loads the worksheet into in-memory SQLite (`xlsx_query_sql`), executes the read-only query, and formats the output as a Markdown table._

### Tutorial 4: Persistent Semantic Memory

Teach `fam` a personal preference that survives restarts:

```bash
node packages/cli/dist/bin/fam.js "Remember that I prefer strict TypeScript with no default exports and 2-space indentation"
```

In a later session, ask:

```bash
node packages/cli/dist/bin/fam.js "Write a small TypeScript utility function for slugifying strings"
```

_`fam` automatically queries `~/.fam/db/memory.sqlite`, retrieves your preference, and shapes the code output according to your formatting preferences._

---

## 🛠 Next Steps

- Read the [CLI & TUI Manual](cli.md) to master slash commands and keyboard shortcuts.
- Explore the [MCP Integration Guide](mcp.md) to connect external tools.
- Consult the [Configuration Reference](configuration.md) to customize model parameters and security policies.

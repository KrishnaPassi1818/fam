# 💻 CLI & TUI Reference Manual

This document provides a comprehensive guide to the `hx` command-line interface, all command flags, subcommands, interactive slash commands, keyboard shortcuts, and the Rust Ratatui TUI frontend.

---

## ⌨️ Command Syntax

```bash
hx [OPTIONS] [PROMPT]
hx <SUBCOMMAND> [SUBCOMMAND_OPTIONS]
```

When called with a `[PROMPT]`, `hx` executes in **one-shot mode** directly in the terminal. When called without arguments, `hx` launches the interactive **Ratatui Rust TUI**.

---

## 🚩 Command-Line Options

| Flag                     | Short | Description                                                                                      |    Default    |
| :----------------------- | :---: | :----------------------------------------------------------------------------------------------- | :-----------: |
| `--model <model>`        | `-m`  | Force a specific model (e.g. `llama3.1:8b`, `qwen2.5-coder:7b`). Overrides the automated router. | `llama3.1:8b` |
| `--role <role>`          | `-r`  | Select system role: `assistant`, `coder`, or `router`.                                           |  `assistant`  |
| `--system <text>`        |       | Completely override the role prompt layer with custom instructions.                              |     None      |
| `--append-system <text>` |       | Append extra instructions to the dynamic context layer.                                          |     None      |
| `--system-file <path>`   |       | Load custom system instructions from a file.                                                     |     None      |
| `--local-only`           |       | Enforce strict offline operation; never invoke the Google Gemini cloud adapter.                  |    `false`    |
| `--yes`                  | `-y`  | Automatically grant approvals for all tool operations (Tiers 0–3).                               |    `false`    |
| `--headless`             |       | Launch harness core in headless stdio IPC mode (used by external TUI frontends).                 |    `false`    |
| `--version`              | `-v`  | Display the installed version of `hx`.                                                           |               |
| `--help`                 | `-h`  | Display help screen with available options and commands.                                         |               |

---

## 🛠 Subcommands

### 1. `hx doctor`

Inspect and verify the local operating system, CPU, RAM, GPU VRAM, Ollama models, LibreOffice, and tools.

```bash
hx doctor
hx doctor --json  # Outputs diagnostic report in machine-readable JSON
```

### 2. `hx mcp`

Manage and test configured Model Context Protocol (MCP) servers.

- **`hx mcp list [--json]`**: Display all registered MCP servers, transport types (`stdio` or `http`), autostart status, and commands.
- **`hx mcp test <name>`**: Connect to an MCP server, list exposed tools, and measure round-trip response latency.
- **`hx mcp add <name> [cmd] [args...] [--transport stdio|http] [--url <url>] [--auto-start]`**: Register a new MCP server in `~/.harness/servers.toml`.
- **`hx mcp remove <name>`**: Remove a server configuration.

### 3. `hx memory`

Inspect and maintain the persistent SQLite semantic memory database.

- **`hx memory list [--project]`**: List all stored memories (with category, privacy level, and ID). Filter to current workspace with `--project`.
- **`hx memory search <query>`**: Run vector similarity search against long-term memory using `nomic-embed-text` embeddings.
- **`hx memory forget <id>`**: Delete a specific memory item by ID.
- **`hx memory wipe`**: Permanently purge all memories and session records from `~/.harness/db/memory.sqlite`.

### 4. `hx replay <run>`

Replay an agent session step-by-step from JSONL execution traces stored in `~/.harness/traces/`.

```bash
hx replay gate_p1_1732304520
```

### 5. `hx trace stats <run>`

Calculate performance statistics for a recorded run: total duration, step count, token consumption, models used, and tool call breakdown.

```bash
hx trace stats gate_p1_1732304520
hx trace stats gate_p1_1732304520 --json
```

### 6. `hx eval`

Run automated benchmark evaluation suites against models:

```bash
hx eval --suite smoke
hx eval --model llama3.1:8b --task task_01
hx eval --suite smoke --json
```

---

## 🖥️ Interactive Ratatui Rust TUI (`crates/hx-tui`)

When launched interactively (`hx`), `hx` spawns the native Rust TUI frontend built with `ratatui 0.30` and `crossterm 0.29`.

### Screen Layout

```
┌─ hx: Local AI Agent Harness ────────────────────────────────────────────────────────┐
│                                                                                     │
│  assistant: How can I help you today?                                               │
│                                                                                     │
│  user: Find all TODO comments in packages/core                                      │
│                                                                                     │
│  ⚙ fs_grep path="packages/core" pattern="TODO" → 14 matches (18ms)                  │
│                                                                                     │
│  assistant: Found 14 TODO items across 4 files in packages/core:                    │
│  1. `src/loop/index.ts:45` - Add telemetry hook                                     │
│  2. `src/tools/executor.ts:112` - Implement custom retry policy                     │
│  ...▌                                                                               │
│                                                                                     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  hx > _                                                                             │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ llama3.1:8b │ ctx 2.4k/8k │ medium │ 21.2 tok/s │ [LOCAL] │ /home/krishna/Projects/harness │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

1. **Header**: Application identifier and active role.
2. **Scrollback Area**: Live markdown stream with color-coded roles (`user`, `assistant`, `system`).
3. **Tool Call Indicators**:
   - `⠋ fs_grep ...`: In-progress tool call with animated braille spinner.
   - `⚙ fs_grep ... → result (duration)`: Completed tool call.
   - `✖ fs_read_file ... (error)`: Failed tool call.
4. **Input Area**: Interactive command line with readline navigation and history recall.
5. **Persistent Status Bar**:
   - **Model**: Active model name.
   - **Context Meter**: Real-time token consumption vs. max context limit (e.g. `ctx 2.4k/8k`).
   - **Tier**: Active prompt tier (`full`, `medium`, `min`).
   - **Tokens/Sec**: Live generation throughput telemetry.
   - **Placement Badge**: `[LOCAL]` (green) or `[CLOUD]` (blue).
   - **Working Directory**: Active workspace root.

---

## 🛡️ Approval Modal Dialog

When an agent invokes a tool classified in **Tier 2** (external/destructive write), **Tier 3** (shell command), or **Tier 4** (irreversible action), execution pauses and displays an approval modal:

```
┌─────────────────────────── Tool Approval Required ────────────────────────────┐
│ Tool:      sandbox_run_command                                                 │
│ Risk Tier: Tier 3 (Shell & System Command)                                     │
│                                                                                │
│ Command Preview:                                                               │
│   git checkout -b feature/auth                                                 │
│                                                                                │
│ Actions:                                                                       │
│  [y] Approve once    [a] Approve for session    [n] Deny    [e] Edit    [?] Info   │
└────────────────────────────────────────────────────────────────────────────────┘
```

### Approval Key Controls

- **`y`**: Approve this tool call once.
- **`a`**: Approve this tool and arguments for the rest of the current session.
- **`n`** (or `Esc`): Deny execution and return a permission rejection to the agent.
- **`e`**: Edit arguments before execution.
- **`?`**: View full tool metadata, annotations, and schema details.
- **Tier 4 Confirmation**: If a tool is classified as Tier 4, the user must explicitly type `CONFIRM` and press Enter.

---

## ⌨️ TUI Keyboard Shortcuts

| Shortcut              | Action                                                                  |
| :-------------------- | :---------------------------------------------------------------------- |
| `Enter`               | Submit current input prompt                                             |
| `Esc`                 | Interrupt active model generation or running tool calls (`AbortSignal`) |
| `Ctrl+C`              | Cleanly terminate session and shut down running MCP servers             |
| `Up` / `Down`         | Navigate through input command history                                  |
| `PageUp` / `PageDown` | Scroll conversation history viewport                                    |
| `Home` / `End`        | Move cursor to beginning or end of input line                           |
| `Ctrl+L`              | Clear screen view (scrollback history retained)                         |

---

## 💬 Interactive Slash Commands

Type these commands directly into the prompt line during an interactive session:

| Slash Command         | Description                                                                 |
| :-------------------- | :-------------------------------------------------------------------------- |
| `/help`               | Print list of all available commands and keyboard controls                  |
| `/context`            | Display real-time token breakdown table (system, tools, history, headroom)  |
| `/compact`            | Manually compress past conversation history using small model summarization |
| `/undo`               | Roll back the last file modifications from `~/.harness/backups/`            |
| `/memory list`        | List semantic memories stored in SQLite                                     |
| `/memory search <q>`  | Perform vector search across stored memories                                |
| `/memory forget <id>` | Delete a memory entry                                                       |
| `/model <name>`       | Switch active model on the fly (e.g. `/model qwen2.5-coder:7b`)             |
| `/models`             | Display list of installed local models and placement                        |
| `/role <role>`        | Switch active prompt role (`assistant`, `coder`, `router`)                  |
| `/system [text]`      | Inspect or temporarily override the system prompt                           |
| `/local`              | Enforce offline mode for the rest of the session                            |
| `/cloud`              | Enable cloud escalation for complex planning                                |
| `/clear`              | Clear the conversation history from view                                    |
| `/exit` (or `/quit`)  | Exit the application                                                        |

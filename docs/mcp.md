# 🔌 Model Context Protocol (MCP) Integration Guide

**Model Context Protocol (MCP)** is the open standard that connects AI assistants to local and remote tools, data sources, and execution environments.

In `fam`, **MCP is the non-negotiable architectural boundary**:

- The agent core has **zero** built-in domain tools.
- All capabilities—filesystem operations, shell execution, office document handling, and web search—are isolated MCP servers.
- Third-party MCP servers can be added via configuration with zero code changes.

---

## 🏗 Architecture & Lifecycles

```
┌────────────────────────────────────────────────────────────┐
│                    fam Core (TypeScript)                    │
│                                                            │
│   McpHost (Multi-Server Manager)                           │
│   ├── McpConnection (StdioClientTransport / SSEClient)     │
│   └── McpRegistryBridge                                    │
│       ├── Canonical Names (<server>.<tool>)                │
│       ├── Model-Safe Aliases (<server>_<tool>)             │
│       ├── Collision Resolution (auto _2, _3 suffixing)     │
│       └── Annotations & Permission Tier Mapping            │
└──────────────────────────────┬─────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼ stdio                               ▼ HTTP / SSE
┌──────────────────────┐                ┌──────────────────────┐
│  Local MCP Server    │                │  Remote MCP Server   │
│  (Rust / Node process│                │  (Streamable HTTP)   │
└──────────────────────┘                └──────────────────────┘
```

### Server Lifecycles

1. **Lazy Initialization**: MCP servers configured with `autoStart = false` are spawned only when the agent specifically requests tools provided by that server.
2. **Auto-Start**: Core servers (`fs`, `sandbox`, `office`, `web`) initialize concurrently during session startup.
3. **Dynamic Discovery (`list_changed`)**: `McpConnection` listens for `notifications/tools/list_changed` events, updating available tools dynamically without session restart.
4. **Resilience**: Processes that terminate unexpectedly are automatically restarted using exponential backoff.

---

## 🏷️ Tool Naming & Small-Model Aliasing

Small local models (e.g. `llama3.1:8b`, `qwen2.5-coder:7b`) struggle with complex tool namespaces containing dots or special characters. `fam` implements a two-tier identifier system:

### 1. Canonical Name

Internally, tools are tracked as `<server>.<tool_name>`.

- Example: `fs.read_file`, `office.xlsx_write_cells`.

### 2. Model-Safe Alias

When sending tool definitions to local models, names are mapped to clean identifiers matching `^[a-zA-Z0-9_]{1,64}$`:

- Canonical `fs.read_file` → Model receives `fs_read_file`
- Canonical `web.web_search` → Model receives `web_web_search`

If two servers expose conflicting tool names, the registry bridge automatically appends deterministic numeric suffixes (e.g. `fs_read_file_2`).

---

## 📋 Tool Annotations & Execution Scheduling

Every tool in `fam` carries annotations that govern how the **ToolExecutor** schedules calls:

| Annotation        |   Type    | Impact on Execution                                                                                             |
| :---------------- | :-------: | :-------------------------------------------------------------------------------------------------------------- |
| `readOnlyHint`    | `boolean` | **Parallel Execution**: Read-only tools run concurrently in parallel batches (up to 8 simultaneous calls).      |
| `destructiveHint` | `boolean` | **Serialization**: Mutating tools run strictly sequentially with path conflict detection and pre-write backups. |
| `idempotentHint`  | `boolean` | **Auto-Retry**: If execution fails due to transport or timeout, idempotent calls are safely retried.            |
| `openWorldHint`   | `boolean` | **Security Warning**: Alerts the user that the tool fetches untrusted external data (e.g. web pages).           |

---

## 📦 Built-In MCP Servers

`fam` ships with four built-in, production-grade MCP servers:

### 1. `fam-fs` (Native Rust)

Located at `servers/fs/` (compiled to `target/debug/fam-fs` or `target/release/fam-fs`).

- **Confinement Engine**: Confines operations to `--root` workspace; rejects directory traversal and symlink escapes.
- **Tools**:
  - `fs_read_file(path, start_line?, end_line?)`: Bounded file reading with line numbers.
  - `fs_list_dir(path, max_entries?)`: Bounded directory listing excluding noisy directories (`.git`, `node_modules`).
  - `fs_file_info(path)`: File metadata, byte size, timestamps, line counts.
  - `fs_glob(pattern, root?)`: Fast glob search respecting `.gitignore`.
  - `fs_grep(pattern, path?, context_lines?)`: Regex search with line numbers and truncation indicators.
  - `fs_write_file(path, content)`: Atomic file creation and writing.
  - `fs_apply_edit(path, search, replace)`: Whitespace-tolerant fuzzy search/replace patcher.
  - `fs_move(source, destination)`: Atomic move/rename.
  - `fs_trash(path)`: Safe deletion using OS trash bin.
  - `fs_repo_map(root?)`: Tree-sitter AST extraction for Rust, TypeScript, JavaScript, and Python.

### 2. `fam-sandbox` (Native Rust)

Located at `servers/sandbox/` (compiled to `target/debug/fam-sandbox`).

- **Isolation**: Command execution bounded by execution timeouts, memory caps, and workspace scoping.
- **Tools**:
  - `sandbox_run_command(command, cwd?, timeout_ms?)`: Runs shell commands with scrubbed environment.
  - `sandbox_run_code(language, code)`: Executes isolated code snippets (Python, Node.js, Bash).

### 3. `office` (TypeScript)

Located at `servers/office/` (`servers/office/dist/index.js`).

- **Superpowers**: Read, manipulate, and generate complex office documents without context pollution.
- **Read Tools**: `docx_read`, `xlsx_describe`, `xlsx_read_range`, `pptx_read`, `pdf_read`.
- **SQL on Spreadsheets**: `xlsx_query_sql(path, query)` executes read-only SQL queries against spreadsheets in in-memory SQLite.
- **Write Tools**: `xlsx_write_cells`, `xlsx_add_formula`, `xlsx_add_sheet`, `xlsx_create_from_csv`, `docx_replace_text`, `docx_insert_paragraph`, `docx_add_table`, `docx_create_from_markdown`, `docx_apply_template`, `pptx_create`, `pptx_add_slide`.
- **LibreOffice Manager**: Headless `soffice` runner with isolated profile directories for `convert`, `recalc`, and `render_preview`.
- **Safety**: Working-copy isolation, pre-write snapshotting, and verify-by-reopen checks.

### 4. `web` (TypeScript)

Located at `servers/web/` (`servers/web/dist/index.js`).

- **Tools**:
  - `web_web_search(query, limit?)`: Web search returning structured search results.
  - `web_fetch_markdown(url)`: Fetches HTML and converts to clean, readability-filtered Markdown.
  - `web_fetch_many(urls)`: Concurrent fetching of multiple URLs.

---

## ➕ Adding Custom Third-Party MCP Servers

You can connect any standard MCP server to `fam` using the CLI or configuration file.

### Method 1: Using the CLI

```bash
# Add a local stdio MCP server (e.g. GitHub MCP server)
fam mcp add github npx -y @modelcontextprotocol/server-github --auto-start

# Add a remote HTTP/SSE MCP server
fam mcp add analytics --transport http --url https://mcp.internal.corp/sse
```

### Method 2: Editing `~/.fam/servers.toml`

Add your server entry to `~/.fam/servers.toml`:

```toml
[servers.github]
transport = "stdio"
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]
auto_start = true
enabled = true

[servers.remote_db]
transport = "http"
url = "https://mcp.example.com/sse"
auto_start = false
headers = { Authorization = "Bearer ${REMOTE_MCP_TOKEN}" }
enabled = true
```

### First-Connect Approval Flow

When a new third-party MCP server is connected for the first time, `fam` pauses and displays the server command, executable path, and discovered tool schemas. The user must approve the server before tools can be invoked.

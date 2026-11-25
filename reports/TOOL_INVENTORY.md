# Complete Tool Inventory

**Target System**: FAM (Local Autonomous AI Agent Harness)  
**Date**: November 2026  
**Scope**: All built-in tools, MCP servers, Rust servers, Office tools, and Browser tools.

---

## 1. Summary of Registered Tools

FAM organizes tools into three functional tiers and several risk categories:
- **Tier 0 (Read-Only / Ambient)**: Idempotent, non-destructive, ambient context inspection (no user prompt required).
- **Tier 1 (Normal Workspace Modification)**: Creating/editing files within the workspace, switching tabs, running non-destructive scripts.
- **Tier 2 (Sensitive / Network / Shell)**: Arbitrary shell execution, web requests, email sending, out-of-workspace file modification (requires confirmation or policy allowlist).
- **Tier 3 (High-Impact Mutation)**: Deleting directories, package installations, system configuration changes (requires explicit confirmation).
- **Tier 4 (Critical / Administrative)**: Sudo escalation, disk formatting, kernel/service alteration (requires secure privilege broker authorization).

---

## 2. Comprehensive Tool Catalog

### 2.1 Built-in Core Tools (`packages/core/src/loop/index.ts`, `packages/core/src/tools/`)

| Tool Name | Alias | Category | Tier | Input Schema | Annotations | Description / Status |
|---|---|---|---|---|---|---|
| `echo` | `echo` | built-in | 0 | `{ message: string }` | readOnly, idempotent | Diagnostic echo tool. |
| `current_time` | `current_time` | built-in | 0 | `{}` | readOnly, idempotent | Returns ISO timestamp. |
| `math` | `math` | built-in | 0 | `{ expression: string }` | readOnly, idempotent | Evaluates mathematical expressions and formulas. |
| `find_tools` | `find_tools` | meta | 0 | `{ query: string, category?: string }` | readOnly, idempotent | Discovers tools dynamically via embeddings. |
| `blob_read` | `blob_read` | context | 0 | `{ handle: string, start?: int, end?: int }` | readOnly, idempotent | Reads chunks of offloaded large tool outputs. |
| `blob_grep` | `blob_grep` | context | 0 | `{ handle: string, pattern: string }` | readOnly, idempotent | Regex search across offloaded large tool outputs. |
| `remember` | `remember` | memory | 1 | `{ text: string, kind?: string, tags?: string[] }` | idempotent | Persists memory into SQLite vector store. |
| `todo` | `todo` | memory | 0 | `{ action: string, text?: string, id?: int }` | - | Working memory task tracking. |
| `scratch` | `scratch` | memory | 0 | `{ action: string, key: string, value?: string }` | - | Scratchpad key-value working memory. |

---

### 2.2 Filesystem Server Tools (`servers/fs` — Rust `fam_fs`)

| Tool Name | Alias | Category | Tier | Input Schema | Annotations | Description / Status |
|---|---|---|---|---|---|---|
| `fs_read_file` | `read_file` | filesystem | 0 | `{ path: string, start_line?: int, end_line?: int }` | readOnly, idempotent | Reads file content with optional line boundaries. |
| `fs_read_file_range` | `read_file_range` | filesystem | 0 | `{ path: string, offset: int, length: int }` | readOnly, idempotent | Reads byte range of file. |
| `fs_list_dir` | `list_dir` | filesystem | 0 | `{ path?: string, max_depth?: int, show_hidden?: bool }` | readOnly, idempotent | Lists directory entries. |
| `fs_tree` | `tree` | filesystem | 0 | `{ path?: string, max_depth?: int }` | readOnly, idempotent | Generates tree view of directory. |
| `fs_file_info` | `file_info` | filesystem | 0 | `{ path: string }` | readOnly, idempotent | Inspects size, timestamps, permissions, is_dir. |
| `fs_exists` | `exists` | filesystem | 0 | `{ path: string }` | readOnly, idempotent | Checks file or directory existence. |
| `fs_read_binary` | `read_binary` | filesystem | 0 | `{ path: string, max_bytes?: int }` | readOnly, idempotent | Reads binary file in hex representation. |
| `fs_read_multiple` | `read_multiple` | filesystem | 0 | `{ paths: string[] }` | readOnly, idempotent | Batch reads up to 10 files in parallel. |
| `fs_compare_files` | `compare_files` | filesystem | 0 | `{ path_a: string, path_b: string }` | readOnly, idempotent | Compares two files and returns unified diff. |
| `fs_file_hash` | `file_hash` | filesystem | 0 | `{ path: string, algorithm?: string }` | readOnly, idempotent | Computes SHA256/MD5 hash. |
| `fs_glob` | `glob` | filesystem | 0 | `{ pattern: string, path?: string, max_results?: int }` | readOnly, idempotent | Finds files matching glob patterns. |
| `fs_grep` | `grep` | filesystem | 0 | `{ pattern: string, path?: string, case_sensitive?: bool }` | readOnly, idempotent | Regex search across text files. |
| `fs_search_files` | `search_files` | filesystem | 0 | `{ query: string, path?: string }` | readOnly, idempotent | Substring search across filenames and content. |
| `fs_write_file` | `write_file` | filesystem | 1 | `{ path: string, content: string, create_dirs?: bool }` | destructive | Writes or overwrites entire file content. |
| `fs_create_file` | `create_file` | filesystem | 1 | `{ path: string, content?: string }` | - | Creates a new file (fails if already exists). |
| `fs_create_directory` | `create_directory` | filesystem | 1 | `{ path: string, recursive?: bool }` | - | Creates directory path. |
| `fs_append_file` | `append_file` | filesystem | 1 | `{ path: string, content: string }` | - | Appends content to existing file. |
| `fs_apply_edit` | `apply_edit` | filesystem | 1 | `{ path: string, edits: array }` | - | Applies fuzzy search/replace blocks. |
| `fs_copy` | `copy` | filesystem | 1 | `{ from: string, to: string, overwrite?: bool }` | - | Copies file or directory. |
| `fs_move` | `move` | filesystem | 1 | `{ from: string, to: string, overwrite?: bool }` | - | Moves file or directory. |
| `fs_rename` | `rename` | filesystem | 1 | `{ path: string, new_name: string }` | - | Renames file or directory. |
| `fs_trash` | `trash` | filesystem | 2 | `{ path: string }` | destructive | Moves file to OS trash. |
| `fs_delete` | `delete` | filesystem | 2 | `{ path: string, recursive?: bool }` | destructive | Permanently deletes file or empty directory. |
| `fs_repo_map` | `repo_map` | filesystem | 0 | `{ path?: string, max_tokens?: int }` | readOnly, idempotent | Tree-sitter code symbol skeleton map. |
| `fs_find_symbol` | `find_symbol` | filesystem | 0 | `{ symbol: string, path?: string }` | readOnly, idempotent | Finds definition/references of code symbol. |

---

### 2.3 Terminal Execution Server Tools (`servers/sandbox` — Rust `fam_sandbox`)

| Tool Name | Alias | Category | Tier | Input Schema | Annotations | Description / Status |
|---|---|---|---|---|---|---|
| `sandbox_run_command` | `run_command` | execution | 2 | `{ command: string, cwd?: string, timeout_ms?: int }` | destructive, openWorld | Executes shell command in bash. |
| `sandbox_run_script` | `run_script` | execution | 2 | `{ path: string, interpreter?: string, args?: string[], cwd?: string }` | destructive, openWorld | Executes script from disk. |
| `sandbox_run_python` | `run_python` | execution | 2 | `{ code: string, timeout_ms?: int }` | destructive, openWorld | Executes inline Python snippet. |
| `sandbox_run_node` | `run_node` | execution | 2 | `{ code: string, timeout_ms?: int }` | destructive, openWorld | Executes inline Node.js snippet. |
| `sandbox_run_shell` | `run_shell` | execution | 2 | `{ script: string, shell?: string, cwd?: string }` | destructive, openWorld | Executes multi-line shell script. |
| `sandbox_run_code` | `run_code` | execution | 2 | `{ language: string, code: string, timeout_ms?: int }` | destructive, openWorld | Executes snippet in python/bash/node/sh. |
| `sandbox_get_environment` | `get_environment` | execution | 0 | `{}` | readOnly, idempotent | Inspects OS, arch, installed runtimes/compilers. |
| `sandbox_check_command` | `check_command` | execution | 0 | `{ command: string }` | readOnly, idempotent | Checks if binary is on PATH and gets version. |
| `sandbox_get_process_status` | `get_process_status` | execution | 0 | `{ pid: int }` | readOnly | Checks if PID is active and gets state. |
| `sandbox_terminate_process` | `terminate_process` | execution | 2 | `{ pid: int, signal?: string }` | destructive | Sends SIGTERM or SIGKILL to PID. |

---

### 2.4 Browser Automation Tools (`packages/browser` & ANARC)

| Tool Name | Alias | Category | Tier | Input Schema | Annotations | Description / Status |
|---|---|---|---|---|---|---|
| `browser_health` | `browser_health` | browser | 0 | `{}` | readOnly, idempotent | Checks ANARC engine & socket connectivity. |
| `browser_launch` | `browser_launch` | browser | 1 | `{}` | - | Spawns ANARC process and verifies window readiness. |
| `browser_close` | `browser_close` | browser | 2 | `{}` | destructive | Shuts down ANARC browser. |
| `browser_list_tabs` | `browser_list_tabs` | browser | 0 | `{}` | readOnly, idempotent | Lists all open tabs and active tab. |
| `browser_new_tab` | `browser_new_tab` | browser | 1 | `{ url?: string }` | - | Opens new tab with optional destination URL. |
| `browser_switch_tab` | `browser_switch_tab` | browser | 1 | `{ tabId: string }` | - | Focuses tab by ID. |
| `browser_close_tab` | `browser_close_tab` | browser | 1 | `{ tabId: string }` | destructive | Closes tab by ID. |
| `browser_navigate` | `browser_navigate` | browser | 1 | `{ url: string, tabId?: string }` | - | Navigates tab to URL and waits for load. |
| `browser_back` | `browser_back` | browser | 1 | `{ tabId?: string }` | - | Navigates backwards in history. |
| `browser_forward` | `browser_forward` | browser | 1 | `{ tabId?: string }` | - | Navigates forward in history. |
| `browser_reload` | `browser_reload` | browser | 1 | `{ tabId?: string, ignoreCache?: bool }` | - | Reloads active page. |
| `browser_get_url` | `browser_get_url` | browser | 0 | `{ tabId?: string }` | readOnly, idempotent | Returns current page URL. |
| `browser_get_title` | `browser_get_title` | browser | 0 | `{ tabId?: string }` | readOnly, idempotent | Returns current page title. |
| `browser_see` | `browser_see` | browser | 0 | `{ scope?: string, tabId?: string }` | readOnly | Returns compact index of interactive elements (`e1`, `i1`). |
| `browser_read` | `browser_read` | browser | 0 | `{ mode?: string, max_chars?: int, tabId?: string }` | readOnly | Reads page text, tables, links, or outline. |
| `browser_read_dom` | `browser_read_dom` | browser | 0 | `{ tabId?: string }` | readOnly | Reads DOM tree structure of page. |
| `browser_read_links` | `browser_read_links` | browser | 0 | `{ tabId?: string }` | readOnly | Extracts all hyperlinks with hrefs and labels. |
| `browser_find` | `browser_find` | browser | 0 | `{ query: string, tabId?: string }` | readOnly | Finds elements matching text query. |
| `browser_screenshot` | `browser_screenshot` | browser | 0 | `{ target?: string, tabId?: string }` | readOnly | Captures viewport/element screenshot to PNG. |
| `browser_click` | `browser_click` | browser | 1 | `{ refId: string, tabId?: string }` | - | Clicks indexed element by ref ID. |
| `browser_click_coords` | `browser_click_coords`| browser | 1 | `{ x: int, y: int, tabId?: string }` | - | Clicks at viewport coordinates (fallback). |
| `browser_type` | `browser_type` | browser | 1 | `{ refId: string, text: string, tabId?: string }` | - | Types text into input element. |
| `browser_fill` | `browser_fill` | browser | 1 | `{ refId: string, text: string, tabId?: string }` | - | Clears and sets value of input element. |
| `browser_select` | `browser_select` | browser | 1 | `{ refId: string, value: string, tabId?: string }` | - | Selects option in dropdown element. |
| `browser_scroll` | `browser_scroll` | browser | 1 | `{ direction: string, tabId?: string }` | - | Scrolls page down, up, top, or end. |
| `browser_press_key` | `browser_press_key` | browser | 1 | `{ chord: string, tabId?: string }` | - | Sends keyboard chord (e.g. Enter, Escape). |
| `browser_wait` | `browser_wait` | browser | 0 | `{ ms?: int, stable?: bool, tabId?: string }` | readOnly | Waits for stability or specified duration. |
| `browser_execute_js` | `browser_execute_js` | browser | 2 | `{ script: string, tabId?: string }` | - | Evaluates JavaScript in page context. |

---

## 3. Discrepancies and Gap Analysis

1. **Tool Naming & Aliases**:
   - Small models often omit prefixes (calling `write_file` or `run_command` instead of `fs_write_file` or `sandbox_run_command`). FAM's `descriptorMap` handles alias lookup, but schemas must enforce uniform parameter coercion.
2. **Missing Operation Handlers**:
   - `fs_create_directory`, `fs_delete_directory`, `fs_file_type`, and `browser_wait` require standardized handlers across all adapter layers.
3. **Execution ID & Tracking**:
   - None of the current tool results carry an `execution_id` or `task_id`. This must be normalized across all servers.

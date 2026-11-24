# FAM Deep Technical Repository Audit

## 1. Executive Summary & Monorepo Overview

- **Repository Path**: `/home/krishna/Projects/harness`
- **Application Binary**: `fam` (`packages/cli/dist/bin/fam.js`, native TUI in `crates/fam-tui`)
- **Monorepo Architecture**:
  - Package Manager: `pnpm` workspace (v12.9.1) with TypeScript 5.7+ strict ESM project references.
  - Rust Workspace: Cargo workspace covering `crates/fam-tui`, `servers/fs`, `servers/sandbox`.
- **Target Local Model**:
  - Model Name: `qwen3.5:4b` (`ollama:qwen3.5:4b`)
  - Server: Ollama v0.40.7 on `http://127.0.0.1:11434`
  - Footprint: 3.1 GB memory allocated in GPU VRAM (100% GPU offload on NVIDIA RTX 4050 Laptop GPU, 6GB VRAM).
  - Context Window: `numCtx = 4096` tokens.
  - Native Capabilities: Function tool calling, JSON schema output formatting, streaming completions, vision (clip projector).

---

## 2. Monorepo & Package Structure

| Path | Crate / Package Name | Role & Responsibility |
|---|---|---|
| `packages/shared` | `@fam/shared` | Core contract types (`Message`, `ToolCall`, `ToolResult`, `ToolDescriptor`), config schemas (Zod), error taxonomy (`FamError`), logger, token counting utilities. |
| `packages/core` | `@fam/core` | Agent runtime: `AgentLoop`, `PromptBuilder`, `OllamaAdapter`, `GeminiAdapter`, `ToolExecutor`, `PermissionGate`, `ContextManager`, `MemoryService`, `ToolRetriever`, `Router`, `Tracer`. |
| `packages/mcp-host` | `@fam/mcp-host` | MCP client and host manager using `@modelcontextprotocol/sdk`. Manages server lifecycles, stdio/HTTP transports, namespacing, and registry bridging. |
| `packages/cli` | `@fam/cli` | CLI entry point (`fam`), `fam doctor`, MCP configuration commands, and IPC bridge to native Ratatui TUI. |
| `packages/evals` | `@fam/evals` | Evaluation framework: YAML task loaders, automated multi-turn runner, grading, and reporting. |
| `crates/fam-tui` | `fam-tui` | High-performance Rust TUI (Ratatui) communicating via headless IPC JSON streams. |
| `servers/fs` | `fam-fs` | Sandboxed Rust MCP server for filesystem inspection, editing, and tree-sitter repo maps. |
| `servers/sandbox` | `fam-sandbox` | Sandboxed Rust MCP server for isolated command execution. |
| `servers/office` | `@fam/office` | Document processing MCP server (DOCX, XLSX, PPTX, PDF, headless LibreOffice). |
| `servers/web` | `@fam/web` | Web fetching and search MCP server. |

---

## 3. Detailed Answers to Core Architectural Questions

### 3.1 How the Current Model Receives Tools
- In `packages/core/src/loop/index.ts` (`AgentLoop.run()`):
  1. All available tools (built-in, memory, meta-tools, and MCP-registered tools) are retrieved from `McpHost.getTools()`.
  2. If the total number of tools exceeds 8, `ToolRetriever.retrieve(query, routerContext)` computes semantic embeddings (using `nomic-embed-text`) and selects the top-K tools (boosted by category and core tools).
  3. Dynamic blob tools (`blob_read`, `blob_grep`) are conditionally enabled only if large tool results have been offloaded to the blob store.
  4. The filtered `ToolDescriptor[]` list is passed into `adapter.chat({ messages, tools: activeTools })`.

### 3.2 How MCP Tools Are Discovered
- `McpHost` (`packages/mcp-host/src/host.ts`):
  1. Reads configured servers from `config/servers.toml` (and `~/.fam/servers.toml`).
  2. For enabled servers with `autoStart = true` (or upon lazy invocation), `McpConnection` initializes the transport (`StdioClientTransport` or `SSEClientTransport`).
  3. `McpConnection.listTools()` invokes standard MCP `tools/list` JSON-RPC request.
  4. `McpRegistryBridge` (`packages/mcp-host/src/registry.ts`) registers each tool:
     - Namespaced name: `<server>.<tool>` (e.g. `anarc.see`).
     - Alias: `<server>_<tool>` (e.g. `anarc_see`).
     - Annotations: `readOnlyHint`, `idempotentHint`, timeout, and security tier overrides.

### 3.3 How Tool Schemas Are Passed to Ollama
- In `packages/core/src/adapters/ollama.ts` (`OllamaAdapter.convertTools`):
  - Converts `ToolDescriptor[]` into Ollama function calling format:
    ```typescript
    {
      type: "function",
      function: {
        name: t.alias, // e.g. "anarc_see" or "browser_navigate"
        description: t.shortDescription || t.description,
        parameters: t.inputSchema // JSON Schema object
      }
    }
    ```
  - Passed directly in the POST body to Ollama endpoint `http://127.0.0.1:11434/api/chat` under the `"tools"` field.

### 3.4 How Tool Calls Are Parsed
- In `packages/core/src/adapters/ollama.ts`:
  1. **Native Tool Calls**: As Ollama streams chunks from `/api/chat`, lines are parsed. When `chunk.message.tool_calls` is present, it extracts `function.name` and parses `function.arguments` (handling both JSON objects and stringified JSON).
  2. **Fallback Parser**: If the model outputs raw text formatted as JSON blocks (common in smaller models) instead of native tool calls, `OllamaAdapter.parseFallbackToolCalls(text)` executes:
     - Scans for ````json ... ```` blocks or balanced top-level JSON objects.
     - Parses candidate `{ "name": "...", "args": { ... } }` or `{ "tool": "...", "parameters": { ... } }`.
     - Validates and sanitizes unescaped characters/newlines.
     - Assigns unique call IDs (`call_<n>_<timestamp>`).
     - Deduplicates identical repeated calls within the turn.

### 3.5 How Tool Results Return to the Model
- In `packages/core/src/loop/index.ts`:
  1. Tool calls are dispatched to `ToolExecutor.executeBatch(...)`.
  2. Results are formatted as `ToolResult` objects:
     ```typescript
     {
       callId: "call_1_...",
       name: "browser_navigate",
       content: "Navigated to https://mail.google.com/ [Generation: g1]",
       isError: false
     }
     ```
  3. Results are appended to the conversation history as messages with `role: "tool"`:
     ```typescript
     history.push({
       role: "tool",
       callId: toolResult.callId,
       name: toolResult.name,
       content: toolResult.content,
       isError: toolResult.isError
     });
     ```
  4. In the next model turn, `OllamaAdapter.convertMessages()` serializes tool messages into Ollama chat format (`{ role: "tool", content: msg.content }`).

### 3.6 Whether Multi-Round Execution Works
- **Fully Supported & Verified**:
  - `AgentLoop.run()` runs a multi-round state machine loop up to `maxSteps` (default: 30 steps).
  - Loop proceeds through states: `UNDERSTANDING` $\rightarrow$ `PLANNING` $\rightarrow$ `DISCOVERING_TOOLS` $\rightarrow$ `REASONING` $\rightarrow$ `EXECUTING` $\rightarrow$ `OBSERVING` $\rightarrow$ `RECOVERING` $\rightarrow$ `VERIFYING` $\rightarrow$ `COMPLETED`.
  - Termination condition: when the model yields text without any tool calls (`turnToolCalls.length === 0`), the loop transitions to `VERIFYING` $\rightarrow$ `COMPLETED` and yields `{ type: 'finish', response }`.
  - Repetition protection: `hashCall(toolName, args)` tracks identical tool call invocations. If an identical call repeats $\ge 3$ times without progress, a warning is injected; $\ge 4$ throws `LoopDetected`.

### 3.7 How Permissions Are Enforced
- In `packages/core/src/tools/permission.ts` (`PermissionGate`):
  - Tools are classified into 4 tiers:
    - **Tier 0 (Read-Only)**: Automatically allowed (e.g. `fs_read_file`, `browser_get_dom`, `browser_screenshot`).
    - **Tier 1 (Reversible Actions)**: Allowed automatically or governed by workspace rules (e.g. `fs_write_file`, `browser_click`, `browser_navigate`).
    - **Tier 2 (External / Side Effects)**: Requires explicit approval (e.g. `fs_trash`, sending an email, submitting irreversible forms).
    - **Tier 3 (Sensitive Operations)**: Interactive confirmation required (e.g. `sandbox_run_command`, arbitrary shell scripts).
  - Approvals are handled via interactive prompt in TTY mode, or auto-approved when `--yes` / `-y` is passed. Denials return structured `PermissionDenied` errors directly to the agent loop.

### 3.8 How Browser Integration Fits into Current Architecture
- Fits cleanly as an MCP server registered in `config/servers.toml`:
  ```toml
  [servers.browser]
  transport = "stdio"
  command = "/home/krishna/anarc/target/release/anarc-ctl"
  args = ["mcp"]
  autoStart = true
  enabled = true
  ```
- Or through a dedicated FAM browser adapter layer in `packages/core/src/browser/` that exposes semantic `browser_*` tools, managing browser session lifecycles, DOM snapshot compression, and visual fallback coordinates.

### 3.9 How Task Execution and Reporting Currently Work
- **Execution**: Run via CLI `fam "<prompt>"` or `fam --local-only "<prompt>"`.
- **Telemetry**: `Tracer` (`packages/core/src/trace/index.ts`) records JSONL trace files under `~/.fam/traces/<run_id>.jsonl` with structured events for `prompt`, `model_call`, `tool_call`, `tool_result`, `state_change`, and `session_end`.
- **Inspection**: `fam trace stats <run_id>` computes latency, steps, token consumption, and error rates. `fam replay <run_id>` replays the entire interaction step-by-step.
- **Reporting**: `packages/evals/src/reporter.ts` generates structured Markdown and JSON reports detailing task objectives, duration, status, steps, token metrics, and assertion results.

---

## 4. Current Limitations & Compatibility Analysis for Browser Integration

1. **Context Window Constraint (4096 tokens)**:
   - `qwen3.5:4b` has a 4096-token limit. A single raw web page DOM dump often exceeds 10,000–50,000 tokens.
   - **Requirement**: FAM cannot send raw HTML or full DOM trees to Qwen 3.5 4B. It must use ANARC's compact indexed representation (`see`) or pruned accessibility trees that fit within 400–600 tokens per turn.
2. **Tool Output Budgeting**:
   - `packages/shared/src/types/tool.ts` enforces `maxToolOutputChars` (default: 8000 chars).
   - If page read outputs exceed 8000 characters, FAM's `ContextManager` offloads the excess content into blob handles (`blob_<id>`) and presents a summary.
3. **Vision Processing in Ollama**:
   - `qwen3.5:4b` has vision capability enabled in `config/models.toml` (`vision = true`).
   - Images are passed via base64 encoded strings in `msg.parts = [{ type: 'image', data: base64 }]`.
   - Visual inspection should be used as a targeted fallback when DOM elements cannot be identified semantically.

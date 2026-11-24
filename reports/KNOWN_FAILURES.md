# Known Failures & Architectural Deficiencies

**Target System**: FAM (Local Autonomous AI Agent Harness)  
**Date**: November 2026

This document catalogs observed and audited failure modes in the FAM and ANARC codebases, organized by subsystem.

---

## 1. Agent Loop & State Machine

### Failure 1.1: False Success Claims Without Tool Execution Evidence
- **Source File**: `packages/core/src/loop/index.ts`
- **Affected Function**: `AgentLoop.run()` (lines 517–533)
- **Root Cause**: When the model finishes streaming text and emits zero tool calls (`turnToolCalls.length === 0`), the loop assumes the overall objective is satisfied, unconditionally transitions to `VERIFYING` and `COMPLETED`, and yields `{ type: 'finish' }`. If the user asked "Create script X and run it", but the model hallucinated code in conversational text without invoking `fs_create_file` or `sandbox_run_command`, FAM falsely declares the task finished.
- **Recommended Change**: Track required task actions and execution evidence. Transitioning to `COMPLETED` requires grounded verification that every tool-dependent step in the execution plan has a successful `NormalizedToolResult`. If the model claims completion without calling required tools, inject a verification failure prompt and transition to `REPLANNING`.

### Failure 1.2: Divergence From Required State Machine Lifecycle
- **Source File**: `packages/core/src/loop/state-machine.ts`
- **Affected Class**: `AgentStateMachine`
- **Root Cause**: The current state machine uses states `UNDERSTANDING`, `DISCOVERING_TOOLS`, `REASONING`, `WAITING_FOR_PERMISSION`, `RECOVERING`. The engineering specification mandates: `IDLE`, `PLANNING`, `TOOL_SELECTION`, `AWAITING_APPROVAL`, `EXECUTING`, `OBSERVING`, `VERIFYING`, `REPLANNING`, `COMPLETED`, `FAILED`, `CANCELLED`.
- **Recommended Change**: Refactor `AgentExecutionState` to support the required 11 explicit states while maintaining backward-compatible transition aliases.

### Failure 1.3: Unbounded or Blind Retries on Permanent Errors
- **Source File**: `packages/core/src/loop/index.ts`
- **Affected Function**: `AgentLoop.run()` (lines 654–672)
- **Root Cause**: While a basic repetition detector checks identical calls, persistent permission rejections or missing command errors result in continuous retries until `maxSteps` is exhausted, wasting context and tokens.
- **Recommended Change**: Classify errors into transient vs. permanent. Permanent errors (e.g. `PermissionDenied`, command not found on PATH) must immediately fail the current branch and trigger structured replanning or abort without retrying identical invocations.

---

## 2. Tool Execution & Result Contract

### Failure 2.1: Lack of Standardized Execution Ledger Contract
- **Source File**: `packages/shared/src/types/message.ts`, `packages/core/src/tools/executor.ts`
- **Affected Types/Functions**: `ToolResult`, `ToolExecutor.executeBatch()`
- **Root Cause**: Results are returned as `{ callId: string, name: string, content: string, isError?: boolean }`. There is no tracking of `execution_id`, `task_id`, `arguments`, `duration_ms`, `verified`, or structured `status` (`pending`, `running`, `succeeded`, `failed`, `approval_required`, `cancelled`, `timed_out`).
- **Recommended Change**: Implement `NormalizedToolResult` contract, validate the schema with Zod/Ajv, and log each tool execution in the task ledger.

### Failure 2.2: Inverted Validation and Permission Checking Sequence
- **Source File**: `packages/core/src/tools/executor.ts`
- **Affected Function**: `ToolExecutor.executeSingle()`
- **Root Cause**: Permission checking is invoked before arguments are validated and coerced by `ToolValidator`. If the model hallucinates argument names, the user might be prompted to approve an invalid operation that subsequently fails validation.
- **Recommended Change**: Ensure the pipeline executes in strict sequence:
  `Tool Selection -> Argument Coercion & Validation -> Permission Checking -> Execution -> Normalization -> Verification`.

---

## 3. Filesystem Operations (`servers/fs`)

### Failure 3.1: Missing Dedicated Directory & Type Classification Tools
- **Source File**: `servers/fs/src/tools/mod.rs`
- **Affected Functions**: `dispatch_tool_call()`
- **Root Cause**: `servers/fs` provides `write_file` and `apply_edit`, but lacks dedicated atomic operations for `fs_create_directory`, `fs_delete_directory`, `fs_file_type`, and `fs_read_structured`.
- **Recommended Change**: Implement explicit handlers in `servers/fs` and expose them through MCP tool descriptors.

---

## 4. Terminal & System Execution (`servers/sandbox`)

### Failure 4.1: Inability to Perform Authorized Administrative Tasks
- **Source File**: `servers/sandbox/src/tools.rs`
- **Affected Functions**: `execute_run_command()`
- **Root Cause**: No privilege broker exists. Sudo commands fail due to missing TTY or hang indefinitely.
- **Recommended Change**: Implement `PrivilegeBroker` with structured administrative operations (`admin_inspect_system`, `admin_manage_service`, `admin_install_package`, `admin_run_privileged`), native terminal password prompts, and complete credential redaction.

---

## 5. Context & Observation Staleness

### Failure 5.1: Cross-Turn Stale Observations
- **Source File**: `packages/core/src/context/manager.ts`, `packages/core/src/loop/index.ts`
- **Affected Functions**: `prepareContext()`, `AgentLoop.run()`
- **Root Cause**: When navigating to a new URL in ANARC, previous DOM elements (`b1`, `i1`, `e1`) remain in conversation history. Similarly, overwritten files retain old content references.
- **Recommended Change**: Implement observation invalidation. Tag DOM observations with `url` and `timestamp`. When navigation occurs, invalidate previous DOM observations.

---

## 6. ANARC Browser Integration

### Failure 6.1: Invisible or Unverified Browser Launch
- **Source File**: `packages/browser/src/anarc.ts`
- **Affected Functions**: `launch()`, `callMcp()`
- **Root Cause**: Launching ANARC simply checks whether a process was spawned or whether `anarc-ctl doctor` succeeds. It does not verify that a visible application window exists on the display server.
- **Recommended Change**: Query display server window managers (e.g. `hyprctl clients` or `wmctrl` / X11 window check) or verify GPUI window handle readiness before marking `browser_launch` as successful.

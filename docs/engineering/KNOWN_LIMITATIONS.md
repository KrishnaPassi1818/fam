# FAM Known Limitations & Small-Model Operational Characteristics

This document details the observed boundaries, trade-offs, and behavioral characteristics of running autonomous agent workloads on compact local models (specifically `qwen3.5:4b` via Ollama).

---

## 1. Small-Model Parameter Constraints (Qwen 3.5 4B)

### Leading Slash Omission in Absolute Paths
- **Observation**: 4B parameter models frequently omit the leading slash when requesting filesystem operations on absolute paths (e.g. producing `home/krishna/...` instead of `/home/krishna/...`).
- **Remediation**: FAM's confinement layers (`servers/fs/src/confinement.rs` and `servers/office/src/safety/confinement.ts`) automatically normalize paths prefixed with `home/` or `root/` to `/home/` and `/root/`.
- **Limitation**: Arbitrary root-level paths (e.g. `etc/...` or `var/...`) will still be treated as relative to the current workspace root unless prefixed with `/`.

### Multi-Tool Chaining and Repetition Loops
- **Observation**: When encountering complex multi-step instructions, small models may get trapped in repetitive tool calls (e.g. calling `fs_list_dir` or `fs_read_file` with identical parameters repeatedly).
- **Remediation**: `packages/core/src/loop/index.ts` incorporates a strict repetition detector (`REPETITION_THRESHOLD = 3`). If a tool is called 3 consecutive times with identical arguments, execution is safely halted.
- **Operational Recommendation**: Break complex workflows into discrete, single-objective user prompts.

### Complex Multi-Class Code Generation
- **Observation**: When authoring large Python or TypeScript projects in a single shot, 4B models may occasionally introduce subtle variable name mismatches (e.g. referencing an undefined variable or mismatched index).
- **Remediation**: FAM's autonomous test-and-repair loop (`sandbox_run_command` -> observe error -> edit file -> re-verify) allows the agent to self-correct code execution errors.

---

## 2. Context Window & Compaction

### Context Compaction Thresholds
- **Policy**: Context compaction triggers when cumulative token consumption reaches 80% of the active model's configured context window (8,192 tokens for `qwen3.5:4b`).
- **Compaction Strategy**: Older turns are summarized into a concise context block, preserving tool execution results and recent exchanges.
- **Trade-off**: Extremely fine-grained details from early tool responses (e.g. specific line numbers of large file dumps) may be compressed. Use targeted tools (`fs_read_range`, `fs_grep`) rather than dumping entire files.

---

## 3. Sandboxing & Terminal Execution

### Headless LibreOffice Dependency
- **Requirement**: Full office document format conversion (`.docx`/`.xlsx` to `.pdf`) relies on the host having LibreOffice installed (`soffice --headless`).
- **Fallback**: Native `.docx` and `.xlsx` files are authored directly using Node.js document libraries (`docx`, `xlsx`) without needing LibreOffice. Conversion and preview require the LibreOffice binary.

### Non-Interactive Shell Environment
- **Constraint**: `sandbox_run_command` executes inside a detached non-interactive child process. Interactive terminal applications expecting user input (e.g. `nano`, `vim`, interactive password prompts) will time out after the configured timeout (default 30 seconds).

---

## 4. Permission Tiers & One-Shot Execution

### Security Boundaries
- **Tier 0 & 1**: Read-only workspace operations run automatically.
- **Tier 2**: Filesystem writes, file deletions, and out-of-workspace reads.
- **Tier 3**: Arbitrary command execution and network operations.
- **Behavior**: In non-interactive environments, any unapproved Tier 2 or Tier 3 tool execution is blocked with an explicit permission denial unless the `--yes` (`-y`) flag is supplied on the CLI.

# Security & Permission Architecture

FAM enforces a zero-trust execution boundary across all model interactions, filesystem operations, and tool invocations.

---

## 1. Safety Tiers & Permission Gates

Every tool registered via MCP or the host is mapped to a strict permission tier:

| Tier | Category | Policy | Examples |
|---|---|---|---|
| **Tier 0** | Pure Informational | Auto-approved | `math`, `clock`, `session_status` |
| **Tier 1** | Workspace Read-Only | Auto-approved inside workspace | `fs_read_file` (in workspace), `fs_list_dir` (in workspace) |
| **Tier 2** | Modifications & Out-of-Workspace | Requires Confirmation or `--yes` | `fs_write_file`, `fs_delete_file`, `fs_read_file` (external) |
| **Tier 3** | Shell & System Execution | Requires Confirmation or `--yes` | `sandbox_run_command`, `git_commit` |
| **Tier 4** | Destructive / Root Boundary | Blocked / Absolute Interactive Approval | Deleting root paths, modifying `/etc` or `/root` |

---

## 2. Interactive and Non-Interactive CLI Boundaries

- **Default Interactive Mode**: When running the TUI or interactive CLI session, Tier 2 and Tier 3 operations prompt the user with tool details and parameters before execution.
- **One-Shot Execution (`fam <prompt>`)**:
  - Without flags: Any Tier 2 or Tier 3 tool execution in a non-interactive pipe is **rejected** with `PermissionDenied`.
  - With `--yes` (`-y`): Grants explicit session authorization for execution during that command run.

---

## 3. Pre-Write Automatic Backups (`BackupService`)

Before modifying, overwriting, editing, or deleting any file on disk, FAM's `ToolExecutor` invokes `BackupService.backupFile()`.
- Snapshots are written to `.fam/backups/<timestamp>-<filename>`.
- Preserves full file content history prior to modifications.
- Allows rollback in the event of an erroneous patch or edit.

---

## 4. Confinement Normalization

Filesystem server confinement (`servers/fs/src/confinement.rs` and `servers/office/src/safety/confinement.ts`) enforces:
- **Authorized Roots**: Restricts filesystem access to the current workspace root and explicitly authorized user directories (e.g. `/home/user`, `/tmp`).
- **Path Traversal Protection**: Rejects `..` traversal past authorized boundaries.
- **Leading Slash Normalization**: Automatically resolves stripped leading slashes frequently produced by small local models (`home/user/...` -> `/home/user/...`), preventing accidental creation of nested directories inside the workspace.

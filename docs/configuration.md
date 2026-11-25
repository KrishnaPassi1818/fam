# ⚙️ Configuration Reference

`fam` uses a structured TOML configuration system. Configuration files are stored in `~/.fam/` in the user's home directory, with built-in defaults supplied from `config/` in the repository root.

---

## 📁 Configuration Directory Structure

```
~/.fam/
├── default.toml         # General settings (default model, timeouts, limits)
├── models.toml          # Model registry, placements, contexts, and capabilities
├── policy.toml          # Security rules, permission tiers, and allowlists
├── privacy.toml         # Secret regex patterns, entropy gates, and path filters
├── routing.toml         # Intent classification, complexity thresholds, model chains
├── servers.toml         # Registered MCP server definitions
├── backups/             # Pre-write file snapshots for instant /undo
├── blobs/               # Content-addressed storage for large tool outputs
├── db/
│   └── memory.sqlite    # SQLite database for persistent vector memory
└── traces/              # JSONL execution trace logs for replay and audit
```

---

## 1. `default.toml` — General Preferences

Controls default models, agent execution limits, and logging.

```toml
[general]
default_model = "qwen3.5:4b"     # Default model for assistant role
default_role = "assistant"        # Default role: assistant | coder | router
local_only = false                # If true, disables all cloud/Gemini escalation
log_level = "info"                # debug | info | warn | error

[limits]
max_steps = 25                    # Maximum agent tool-calling turns per request
max_tokens = 8192                 # Maximum tokens generated across a turn
max_wall_time_seconds = 180       # Maximum execution time before abort
max_tool_output_chars = 8000      # Outputs larger than this are offloaded to blobs
repetition_threshold = 3          # Loop detector: alert if identical call repeats
```

---

## 2. `models.toml` — Model Registry & Hardware Calibration

Defines supported models, placements (GPU vs CPU), context windows, and calibrated tokens/sec.

```toml
[models."qwen2.5:1.5b"]
provider = "ollama"
placement = "cpu"                 # Pin to CPU (num_gpu: 0) to preserve VRAM
tier = "min"                      # Prompt tier: min (≤ 150 tokens)
num_ctx = 4096                    # Maximum context window
measured_tok_per_sec = 36.8       # Generation speed benchmarked on Ryzen 7
caps = { tools = false, parallel_tools = false, json_format = true }

[models."qwen3.5:4b"]
provider = "ollama"
placement = "gpu"                 # Loaded into NVIDIA GPU VRAM (100% GPU, ~3.1 GB)
tier = "medium"                   # Prompt tier: medium (≤ 600 tokens)
num_ctx = 4096                    # Context window
measured_tok_per_sec = 25.6       # Generation speed benchmarked on RTX 4050
caps = { tools = true, parallel_tools = true, vision = true, json_format = true }

[models."qwen2.5-coder:7b"]
provider = "ollama"
placement = "gpu"
tier = "medium"
num_ctx = 8192
measured_tok_per_sec = 24.3
caps = { tools = true, parallel_tools = false, json_format = true }

[models."gemini-2.5-flash"]
provider = "gemini"
placement = "cloud"
tier = "full"                     # Prompt tier: full (≤ 4000 tokens)
num_ctx = 1048576                 # 1M token context window
caps = { tools = true, parallel_tools = true, vision = true, json_format = true }
```

---

## 3. `policy.toml` — Permission Tiers & Security Rules

Governs what tools can be executed automatically vs. what requires user confirmation.

### Permission Tiers

- **Tier 0 (Read-Only)**: Automatically executed (`auto`).
- **Tier 1 (Workspace Writes)**: Automatically executed with pre-write backup snapshotting (`auto`).
- **Tier 2 (External/Destructive Writes)**: Requires interactive user confirmation (`ask`).
- **Tier 3 (Shell & System Command)**: Requires command preview confirmation (`ask`).
- **Tier 4 (Irreversible Destructive)**: Requires typed confirmation (`CONFIRM`).

```toml
[policy]
default_tier = 1

# Command prefix allowlist for Tier 3 shell execution
shell_allowlist = [
  "git status",
  "git diff",
  "git log",
  "pnpm test",
  "pnpm lint",
  "cargo test",
  "cargo check"
]

# Path deny rules (operations targeting these always require Tier 4 or are blocked)
deny_paths = [
  "/etc/**",
  "/usr/**",
  "~/.ssh/**",
  "~/.gnupg/**"
]

[overrides]
"fs.read_file" = 0
"fs.list_dir" = 0
"fs.grep" = 0
"fs.repo_map" = 0
"fs.write_file" = 1
"fs.apply_edit" = 1
"fs.trash" = 2
"sandbox.run_command" = 3
```

---

## 4. `privacy.toml` — Privacy Gate & Secret Filtering

Enforces fail-closed protection to ensure sensitive local data is never sent to cloud APIs.

```toml
[privacy]
enabled = true
entropy_threshold = 4.5           # Shannon entropy score flag for API keys/tokens

# File path patterns tagged as local_only
local_only_paths = [
  "**/.env*",
  "**/secrets/**",
  "**/*.pem",
  "**/*.key",
  "**/*.p12",
  "**/.git/**"
]

# Sensitive token detection regex patterns
secret_patterns = [
  'AIza[0-9A-Za-z\\-_]{35}',                 # Google Gemini API key
  'sk-[a-zA-Z0-9]{48}',                     # OpenAI API key
  'ghp_[0-9a-zA-Z]{36}',                    # GitHub Personal Access Token
  '-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY'  # Private keys
]
```

---

## 5. `routing.toml` — Model Routing & Cascade Chains

Defines how requests are classified and routed to the most efficient model.

```toml
[routing]
router_model = "qwen2.5:1.5b"     # Pinned to CPU for sub-millisecond routing
confidence_threshold = 0.75       # Low confidence triggers escalation

# Intent Mapping
[chains.coding]
primary = "qwen2.5-coder:7b"
fallback = "gemini-2.5-flash"

[chains.general]
primary = "qwen3.5:4b"
fallback = "gemini-2.5-flash"

[chains.office]
primary = "qwen3.5:4b"
fallback = "gemini-2.5-flash"

# Complexity Escalation: Queries with estimated complexity ≥ 4 escalate directly
[complexity_thresholds]
direct_gemini_escalation = 4
```

---

## 6. `servers.toml` — MCP Server Configurations

Configures Model Context Protocol servers.

```toml
[servers.fs]
transport = "stdio"
command = "target/debug/fam-fs"
args = ["--root", "${HOME}"]
auto_start = true
enabled = true

[servers.sandbox]
transport = "stdio"
command = "target/debug/fam-sandbox"
auto_start = true
enabled = true

[servers.office]
transport = "stdio"
command = "node"
args = ["servers/office/dist/index.js"]
auto_start = true
enabled = true

[servers.web]
transport = "stdio"
command = "node"
args = ["servers/web/dist/index.js"]
auto_start = true
enabled = true
```

---

## 🌐 Environment Variables

| Variable         | Description                                                 |
| :--------------- | :---------------------------------------------------------- |
| `GEMINI_API_KEY` | Google Gemini API key for cloud planning and escalation     |
| `OLLAMA_HOST`    | Ollama service endpoint (default: `http://localhost:11434`) |
| `FAM_TUI_BIN`     | Custom path to the compiled `fam-tui` binary                 |
| `FAM_LIVE`        | When set to `1`, enables live integration test suites       |
| `DEBUG`          | Enable verbose diagnostic logging for MCP and AgentLoop     |

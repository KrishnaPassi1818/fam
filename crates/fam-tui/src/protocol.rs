use serde::{Deserialize, Serialize};

/// Messages received from the Backend (TypeScript harness core) -> TUI Frontend
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ToTuiMessage {
    Init {
        model: String,
        #[serde(default = "default_max_ctx")]
        max_ctx: usize,
        tier: String,
        is_local: bool,
        cwd: String,
        #[serde(default = "default_role")]
        role: String,
    },
    Message {
        id: String,
        role: String,
        content: String,
        model: Option<String>,
    },
    Chunk {
        delta: String,
        tokens_per_sec: Option<f64>,
    },
    ToolCall {
        id: String,
        name: String,
        #[serde(default)]
        args: serde_json::Value,
    },
    ToolResult {
        call_id: String,
        is_error: bool,
        content: String,
        duration_ms: Option<u64>,
    },
    Status {
        used_tokens: usize,
        tokens_per_sec: Option<f64>,
        model: Option<String>,
        max_ctx: Option<usize>,
        tier: Option<String>,
        is_local: Option<bool>,
        cwd: Option<String>,
    },
    Warning {
        message: String,
    },
    ApprovalRequest {
        id: String,
        tool_name: String,
        #[serde(default)]
        args: serde_json::Value,
        tier: u8,
        reason: Option<String>,
    },
    Finish {
        response: String,
        total_tokens: usize,
    },
    Error {
        message: String,
    },
    Clear,
    Exit,
}

fn default_max_ctx() -> usize {
    8192
}

fn default_role() -> String {
    "assistant".to_string()
}

/// Messages sent from the TUI Frontend -> Backend (TypeScript harness core)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum FromTuiMessage {
    UserInput {
        text: String,
    },
    ApprovalDecision {
        request_id: String,
        decision: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        edited_args: Option<serde_json::Value>,
    },
    Interrupt,
    Exit,
}

use crate::protocol::{JsonRpcError, JsonRpcRequest, JsonRpcResponse};
use crate::tools::{all_tool_definitions, dispatch_tool_call};
use anyhow::Result;
use serde_json::json;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

pub struct SandboxServer;

impl Default for SandboxServer {
    fn default() -> Self {
        Self::new()
    }
}

impl SandboxServer {
    pub fn new() -> Self {
        Self
    }

    pub async fn run_stdio(&self) -> Result<()> {
        let stdin = tokio::io::stdin();
        let mut reader = BufReader::new(stdin);
        let mut stdout = tokio::io::stdout();

        let mut line = String::new();
        while reader.read_line(&mut line).await? > 0 {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                line.clear();
                continue;
            }

            let req: JsonRpcRequest = match serde_json::from_str(trimmed) {
                Ok(r) => r,
                Err(e) => {
                    let err_resp = JsonRpcResponse {
                        jsonrpc: "2.0".into(),
                        id: json!(null),
                        result: None,
                        error: Some(JsonRpcError {
                            code: -32700,
                            message: format!("Parse error: {e}"),
                            data: None,
                        }),
                    };
                    let mut bytes = serde_json::to_vec(&err_resp)?;
                    bytes.push(b'\n');
                    stdout.write_all(&bytes).await?;
                    stdout.flush().await?;
                    line.clear();
                    continue;
                }
            };

            // Notifications have no id; do not send response
            if req.id.is_none() {
                line.clear();
                continue;
            }

            let id = req.id.unwrap();
            let resp = self.handle_request(&req.method, req.params, id).await;
            let mut bytes = serde_json::to_vec(&resp)?;
            bytes.push(b'\n');
            stdout.write_all(&bytes).await?;
            stdout.flush().await?;

            line.clear();
        }

        Ok(())
    }

    pub async fn handle_request(
        &self,
        method: &str,
        params: Option<serde_json::Value>,
        id: serde_json::Value,
    ) -> JsonRpcResponse {
        match method {
            "initialize" => JsonRpcResponse {
                jsonrpc: "2.0".into(),
                id,
                result: Some(json!({
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "tools": {
                            "listChanged": true
                        }
                    },
                    "serverInfo": {
                        "name": "fam-sandbox",
                        "version": "0.1.0"
                    }
                })),
                error: None,
            },

            "ping" => JsonRpcResponse {
                jsonrpc: "2.0".into(),
                id,
                result: Some(json!({})),
                error: None,
            },

            "tools/list" => JsonRpcResponse {
                jsonrpc: "2.0".into(),
                id,
                result: Some(json!({
                    "tools": all_tool_definitions()
                })),
                error: None,
            },

            "tools/call" => {
                let params = params.unwrap_or(json!({}));
                let tool_name = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let args = params.get("arguments").cloned().unwrap_or(json!({}));

                let call_result = dispatch_tool_call(tool_name, args).await;
                JsonRpcResponse {
                    jsonrpc: "2.0".into(),
                    id,
                    result: Some(serde_json::to_value(call_result).unwrap_or(json!({}))),
                    error: None,
                }
            }

            unknown => JsonRpcResponse {
                jsonrpc: "2.0".into(),
                id,
                result: None,
                error: Some(JsonRpcError {
                    code: -32601,
                    message: format!("Method not found: '{unknown}'"),
                    data: None,
                }),
            },
        }
    }
}

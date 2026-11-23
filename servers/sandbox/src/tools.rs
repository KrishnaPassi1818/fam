use crate::protocol::{ToolAnnotation, ToolCallResult, ToolDefinition};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::process::Command;
use tokio::time::timeout;

pub fn all_tool_definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "run_command".into(),
            description: "Execute a shell command in the workspace environment with timeout and output capture.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "command": { "type": "string", "description": "The shell command to execute" },
                    "cwd": { "type": "string", "description": "Working directory relative to workspace or absolute path (default: current directory)" },
                    "timeout_ms": { "type": "integer", "description": "Command execution timeout in milliseconds (default: 60000)" }
                },
                "required": ["command"]
            }),
            annotations: Some(ToolAnnotation {
                read_only_hint: Some(false),
                destructive_hint: Some(true),
                idempotent_hint: Some(false),
                open_world_hint: Some(true),
            }),
        },
        ToolDefinition {
            name: "run_code".into(),
            description: "Execute a snippet of code in a specified language (python, bash, node, sh).".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "language": { "type": "string", "enum": ["python", "bash", "node", "sh"], "description": "Programming language" },
                    "code": { "type": "string", "description": "Code string to execute" },
                    "timeout_ms": { "type": "integer", "description": "Execution timeout in milliseconds (default: 60000)" }
                },
                "required": ["language", "code"]
            }),
            annotations: Some(ToolAnnotation {
                read_only_hint: Some(false),
                destructive_hint: Some(true),
                idempotent_hint: Some(false),
                open_world_hint: Some(true),
            }),
        },
    ]
}

fn resolve_path(p_str: &str) -> PathBuf {
    if p_str == "~" {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home);
        }
    } else if let Some(stripped) = p_str.strip_prefix("~/") {
        if let Ok(home) = std::env::var("HOME") {
            return PathBuf::from(home).join(stripped);
        }
    }
    let p = Path::new(p_str);
    if p.is_absolute() {
        p.to_path_buf()
    } else {
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")).join(p)
    }
}

pub async fn dispatch_tool_call(name: &str, args: Value) -> ToolCallResult {
    match name {
        "run_command" | "sandbox_run_command" => execute_run_command(args).await,
        "run_code" | "sandbox_run_code" => execute_run_code(args).await,
        unknown => ToolCallResult::error(format!("Unknown tool: '{unknown}'")),
    }
}

pub async fn execute_run_command(args: Value) -> ToolCallResult {
    let command_str = match args.get("command").and_then(|v| v.as_str()) {
        Some(c) if !c.trim().is_empty() => c.trim(),
        _ => return ToolCallResult::error("Missing or empty 'command' parameter"),
    };

    let cwd = args
        .get("cwd")
        .and_then(|v| v.as_str())
        .map(resolve_path)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

    let timeout_ms = args
        .get("timeout_ms")
        .and_then(|v| v.as_u64())
        .unwrap_or(60000)
        .min(300000);

    let mut cmd = Command::new("bash");
    cmd.arg("-c")
        .arg(command_str)
        .stdin(std::process::Stdio::null())
        .current_dir(&cwd);

    let res = timeout(Duration::from_millis(timeout_ms), cmd.output()).await;

    match res {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let exit_code = output.status.code().unwrap_or(-1);
            let success = output.status.success();

            let result_json = json!({
                "command": command_str,
                "cwd": cwd.to_string_lossy(),
                "exit_code": exit_code,
                "success": success,
                "stdout": stdout,
                "stderr": stderr
            });

            if success {
                ToolCallResult::success(result_json.to_string())
            } else {
                let mut tr = ToolCallResult::error(format!(
                    "Command exited with code {exit_code}:\nSTDOUT:\n{stdout}\nSTDERR:\n{stderr}"
                ));
                tr.is_error = Some(!success);
                tr
            }
        }
        Ok(Err(e)) => ToolCallResult::error(format!("Failed to execute process: {e}")),
        Err(_) => ToolCallResult::error(format!("Command timed out after {timeout_ms}ms")),
    }
}

pub async fn execute_run_code(args: Value) -> ToolCallResult {
    let language = match args.get("language").and_then(|v| v.as_str()) {
        Some(l) => l.to_lowercase(),
        None => return ToolCallResult::error("Missing 'language' parameter"),
    };

    let code = match args.get("code").and_then(|v| v.as_str()) {
        Some(c) => c,
        None => return ToolCallResult::error("Missing 'code' parameter"),
    };

    let timeout_ms = args
        .get("timeout_ms")
        .and_then(|v| v.as_u64())
        .unwrap_or(60000)
        .min(300000);

    let extension = match language.as_str() {
        "python" | "py" | "python3" => "py",
        "bash" => "sh",
        "sh" => "sh",
        "node" | "js" | "javascript" => "js",
        unknown => return ToolCallResult::error(format!("Unsupported language: '{unknown}'")),
    };

    let now_nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp_file = std::env::temp_dir().join(format!("hx_code_{}_{}.{}", std::process::id(), now_nanos, extension));

    if let Err(e) = tokio::fs::write(&tmp_file, code).await {
        return ToolCallResult::error(format!("Failed to write temporary script file: {e}"));
    }

    let bin = match extension {
        "py" => "python3",
        "sh" => "bash",
        "js" => "node",
        _ => "bash",
    };

    let mut cmd = Command::new(bin);
    cmd.arg(&tmp_file)
        .stdin(std::process::Stdio::null());

    let res = timeout(Duration::from_millis(timeout_ms), cmd.output()).await;
    let _ = tokio::fs::remove_file(&tmp_file).await;

    match res {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let exit_code = output.status.code().unwrap_or(-1);
            let success = output.status.success();

            let result_json = json!({
                "language": language,
                "exit_code": exit_code,
                "success": success,
                "stdout": stdout,
                "stderr": stderr
            });

            if success {
                ToolCallResult::success(result_json.to_string())
            } else {
                ToolCallResult::error(format!(
                    "Execution failed (code {exit_code}):\n{stderr}\n{stdout}"
                ))
            }
        }
        Ok(Err(e)) => ToolCallResult::error(format!("Failed to spawn {bin}: {e}")),
        Err(_) => ToolCallResult::error(format!("Execution timed out after {timeout_ms}ms")),
    }
}

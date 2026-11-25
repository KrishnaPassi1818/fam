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
            name: "run_script".into(),
            description: "Execute a script file from disk using a specified or inferred interpreter with arguments.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Path to the script file" },
                    "interpreter": { "type": "string", "description": "Interpreter executable (e.g. python3, node, bash, sh)" },
                    "args": { "type": "array", "items": { "type": "string" }, "description": "Arguments to pass to the script" },
                    "cwd": { "type": "string", "description": "Working directory" },
                    "timeout_ms": { "type": "integer", "description": "Execution timeout in milliseconds (default: 60000)" }
                },
                "required": ["path"]
            }),
            annotations: Some(ToolAnnotation {
                read_only_hint: Some(false),
                destructive_hint: Some(true),
                idempotent_hint: Some(false),
                open_world_hint: Some(true),
            }),
        },
        ToolDefinition {
            name: "run_python".into(),
            description: "Execute a Python code snippet directly in the Python runtime.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "code": { "type": "string", "description": "Python source code to execute" },
                    "timeout_ms": { "type": "integer", "description": "Execution timeout in milliseconds (default: 60000)" }
                },
                "required": ["code"]
            }),
            annotations: Some(ToolAnnotation {
                read_only_hint: Some(false),
                destructive_hint: Some(true),
                idempotent_hint: Some(false),
                open_world_hint: Some(true),
            }),
        },
        ToolDefinition {
            name: "run_node".into(),
            description: "Execute a JavaScript/TypeScript code snippet directly in the Node.js runtime.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "code": { "type": "string", "description": "JavaScript code to execute" },
                    "timeout_ms": { "type": "integer", "description": "Execution timeout in milliseconds (default: 60000)" }
                },
                "required": ["code"]
            }),
            annotations: Some(ToolAnnotation {
                read_only_hint: Some(false),
                destructive_hint: Some(true),
                idempotent_hint: Some(false),
                open_world_hint: Some(true),
            }),
        },
        ToolDefinition {
            name: "run_shell".into(),
            description: "Execute a shell script string (bash/zsh/sh).".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "script": { "type": "string", "description": "Shell script code to execute" },
                    "shell": { "type": "string", "description": "Shell executable (bash, zsh, sh; default bash)" },
                    "cwd": { "type": "string", "description": "Working directory" },
                    "timeout_ms": { "type": "integer", "description": "Execution timeout in milliseconds (default: 60000)" }
                },
                "required": ["script"]
            }),
            annotations: Some(ToolAnnotation {
                read_only_hint: Some(false),
                destructive_hint: Some(true),
                idempotent_hint: Some(false),
                open_world_hint: Some(true),
            }),
        },
        ToolDefinition {
            name: "get_environment".into(),
            description: "Inspect the system environment, OS, architecture, and installed toolchains (python, node, git, rust, compilers).".into(),
            input_schema: json!({
                "type": "object",
                "properties": {}
            }),
            annotations: Some(ToolAnnotation {
                read_only_hint: Some(true),
                destructive_hint: Some(false),
                idempotent_hint: Some(true),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "check_command".into(),
            description: "Check if a command or binary is available on the system PATH and inspect its version.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "command": { "type": "string", "description": "Command name to check (e.g. pytest, cargo, git, npm)" }
                },
                "required": ["command"]
            }),
            annotations: Some(ToolAnnotation {
                read_only_hint: Some(true),
                destructive_hint: Some(false),
                idempotent_hint: Some(true),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "get_process_status".into(),
            description: "Check if a process is running by PID and retrieve its status.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "pid": { "type": "integer", "description": "Process ID to inspect" }
                },
                "required": ["pid"]
            }),
            annotations: Some(ToolAnnotation {
                read_only_hint: Some(true),
                destructive_hint: Some(false),
                idempotent_hint: Some(false),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "terminate_process".into(),
            description: "Terminate a running process by PID.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "pid": { "type": "integer", "description": "Process ID to terminate" },
                    "signal": { "type": "string", "description": "Signal to send (SIGTERM, SIGKILL; default SIGTERM)" }
                },
                "required": ["pid"]
            }),
            annotations: Some(ToolAnnotation {
                read_only_hint: Some(false),
                destructive_hint: Some(true),
                idempotent_hint: Some(false),
                open_world_hint: Some(false),
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
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(p)
    }
}

pub async fn dispatch_tool_call(name: &str, args: Value) -> ToolCallResult {
    let clean = name.strip_prefix("sandbox_").unwrap_or(name);
    match clean {
        "run_command" => execute_run_command(args).await,
        "run_script" => execute_run_script(args).await,
        "run_python" => execute_run_python(args).await,
        "run_node" => execute_run_node(args).await,
        "run_shell" => execute_run_shell(args).await,
        "get_environment" => execute_get_environment().await,
        "check_command" => execute_check_command(args).await,
        "get_process_status" => execute_get_process_status(args).await,
        "terminate_process" => execute_terminate_process(args).await,
        "run_code" => execute_run_code(args).await,
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

    let start_time = std::time::Instant::now();
    let mut cmd = Command::new("bash");
    cmd.arg("-c")
        .arg(command_str)
        .stdin(std::process::Stdio::null())
        .current_dir(&cwd);

    let res = timeout(Duration::from_millis(timeout_ms), cmd.output()).await;
    let duration_ms = start_time.elapsed().as_millis() as u64;

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
                "duration_ms": duration_ms,
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

pub async fn execute_run_script(args: Value) -> ToolCallResult {
    let script_path = match args.get("path").and_then(|v| v.as_str()) {
        Some(p) => resolve_path(p),
        None => return ToolCallResult::error("Missing 'path' parameter"),
    };

    if !script_path.exists() {
        return ToolCallResult::error(format!(
            "Script file '{}' does not exist",
            script_path.display()
        ));
    }

    let ext = script_path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("");

    let default_interp = match ext {
        "py" => "python3",
        "js" | "mjs" | "cjs" => "node",
        "sh" | "bash" => "bash",
        "zsh" => "zsh",
        _ => "bash",
    };

    let interp = args
        .get("interpreter")
        .and_then(|v| v.as_str())
        .unwrap_or(default_interp);

    let script_args: Vec<String> = args
        .get("args")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| item.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let cwd = args
        .get("cwd")
        .and_then(|v| v.as_str())
        .map(resolve_path)
        .unwrap_or_else(|| {
            script_path
                .parent()
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
        });

    let timeout_ms = args
        .get("timeout_ms")
        .and_then(|v| v.as_u64())
        .unwrap_or(60000)
        .min(300000);

    let start_time = std::time::Instant::now();
    let mut cmd = Command::new(interp);
    cmd.arg(&script_path)
        .args(&script_args)
        .stdin(std::process::Stdio::null())
        .current_dir(&cwd);

    let res = timeout(Duration::from_millis(timeout_ms), cmd.output()).await;
    let duration_ms = start_time.elapsed().as_millis() as u64;

    match res {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let exit_code = output.status.code().unwrap_or(-1);
            let success = output.status.success();

            let res_json = json!({
                "script": script_path.to_string_lossy(),
                "interpreter": interp,
                "exit_code": exit_code,
                "success": success,
                "duration_ms": duration_ms,
                "stdout": stdout,
                "stderr": stderr
            });

            if success {
                ToolCallResult::success(res_json.to_string())
            } else {
                ToolCallResult::error(format!(
                    "Script failed with code {exit_code}:\nSTDOUT:\n{stdout}\nSTDERR:\n{stderr}"
                ))
            }
        }
        Ok(Err(e)) => ToolCallResult::error(format!("Failed to spawn {interp}: {e}")),
        Err(_) => ToolCallResult::error(format!("Script execution timed out after {timeout_ms}ms")),
    }
}

pub async fn execute_run_python(args: Value) -> ToolCallResult {
    let mut modified = args;
    if let Value::Object(ref mut map) = modified {
        map.insert("language".into(), json!("python"));
    }
    execute_run_code(modified).await
}

pub async fn execute_run_node(args: Value) -> ToolCallResult {
    let mut modified = args;
    if let Value::Object(ref mut map) = modified {
        map.insert("language".into(), json!("node"));
    }
    execute_run_code(modified).await
}

pub async fn execute_run_shell(args: Value) -> ToolCallResult {
    let script = match args.get("script").and_then(|v| v.as_str()) {
        Some(s) => s,
        None => return ToolCallResult::error("Missing 'script' parameter"),
    };

    let shell = args.get("shell").and_then(|v| v.as_str()).unwrap_or("bash");

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

    let start_time = std::time::Instant::now();
    let mut cmd = Command::new(shell);
    cmd.arg("-c")
        .arg(script)
        .stdin(std::process::Stdio::null())
        .current_dir(&cwd);

    let res = timeout(Duration::from_millis(timeout_ms), cmd.output()).await;
    let duration_ms = start_time.elapsed().as_millis() as u64;

    match res {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let exit_code = output.status.code().unwrap_or(-1);
            let success = output.status.success();

            let res_json = json!({
                "shell": shell,
                "exit_code": exit_code,
                "success": success,
                "duration_ms": duration_ms,
                "stdout": stdout,
                "stderr": stderr
            });

            if success {
                ToolCallResult::success(res_json.to_string())
            } else {
                ToolCallResult::error(format!(
                    "Shell execution exited with code {exit_code}:\n{stderr}\n{stdout}"
                ))
            }
        }
        Ok(Err(e)) => ToolCallResult::error(format!("Failed to spawn shell '{shell}': {e}")),
        Err(_) => ToolCallResult::error(format!("Shell script timed out after {timeout_ms}ms")),
    }
}

pub async fn execute_get_environment() -> ToolCallResult {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let cur_dir = std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let home = std::env::var("HOME").unwrap_or_default();

    async fn check_tool(bin: &str, arg: &str) -> Option<String> {
        let mut cmd = Command::new(bin);
        cmd.arg(arg).stdin(std::process::Stdio::null());
        if let Ok(Ok(out)) = timeout(Duration::from_millis(2000), cmd.output()).await {
            if out.status.success() {
                let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
                let first_line = s.lines().next().unwrap_or("").to_string();
                return Some(first_line);
            }
        }
        None
    }

    let python_ver = check_tool("python3", "--version").await;
    let node_ver = check_tool("node", "--version").await;
    let cargo_ver = check_tool("cargo", "--version").await;
    let rustc_ver = check_tool("rustc", "--version").await;
    let git_ver = check_tool("git", "--version").await;
    let pnpm_ver = check_tool("pnpm", "--version").await;

    let res_json = json!({
        "os": os,
        "arch": arch,
        "current_directory": cur_dir,
        "home": home,
        "toolchains": {
            "python": python_ver,
            "node": node_ver,
            "cargo": cargo_ver,
            "rustc": rustc_ver,
            "git": git_ver,
            "pnpm": pnpm_ver
        }
    });

    ToolCallResult::success(res_json.to_string())
}

pub async fn execute_check_command(args: Value) -> ToolCallResult {
    let cmd_name = match args.get("command").and_then(|v| v.as_str()) {
        Some(c) if !c.trim().is_empty() => c.trim(),
        _ => return ToolCallResult::error("Missing 'command' parameter"),
    };

    let mut which_cmd = Command::new("which");
    which_cmd.arg(cmd_name).stdin(std::process::Stdio::null());

    let which_res = timeout(Duration::from_millis(2000), which_cmd.output()).await;

    let (exists, path) = match which_res {
        Ok(Ok(output)) if output.status.success() => {
            let p = String::from_utf8_lossy(&output.stdout).trim().to_string();
            (true, Some(p))
        }
        _ => (false, None),
    };

    let mut version = None;
    if exists {
        for v_flag in &["--version", "-v", "version"] {
            let mut v_cmd = Command::new(cmd_name);
            v_cmd.arg(v_flag).stdin(std::process::Stdio::null());
            if let Ok(Ok(out)) = timeout(Duration::from_millis(2000), v_cmd.output()).await {
                if out.status.success() {
                    let out_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    if !out_str.is_empty() {
                        version = Some(out_str.lines().next().unwrap_or("").to_string());
                        break;
                    }
                }
            }
        }
    }

    let res_json = json!({
        "command": cmd_name,
        "exists": exists,
        "path": path,
        "version": version
    });

    ToolCallResult::success(res_json.to_string())
}

pub async fn execute_get_process_status(args: Value) -> ToolCallResult {
    let pid = match args.get("pid").and_then(|v| v.as_i64()) {
        Some(p) if p > 0 => p,
        _ => return ToolCallResult::error("Missing or invalid 'pid' parameter"),
    };

    #[cfg(unix)]
    {
        let is_running = unsafe { libc::kill(pid as libc::pid_t, 0) == 0 };
        let res_json = json!({
            "pid": pid,
            "running": is_running,
            "status": if is_running { "running" } else { "not running or dead" }
        });
        ToolCallResult::success(res_json.to_string())
    }

    #[cfg(not(unix))]
    {
        ToolCallResult::error("get_process_status is only implemented on Unix")
    }
}

pub async fn execute_terminate_process(args: Value) -> ToolCallResult {
    let pid = match args.get("pid").and_then(|v| v.as_i64()) {
        Some(p) if p > 0 => p,
        _ => return ToolCallResult::error("Missing or invalid 'pid' parameter"),
    };

    let sig_name = args
        .get("signal")
        .and_then(|v| v.as_str())
        .unwrap_or("SIGTERM");

    #[cfg(unix)]
    {
        let sig = match sig_name {
            "SIGKILL" => libc::SIGKILL,
            "SIGINT" => libc::SIGINT,
            _ => libc::SIGTERM,
        };

        let ret = unsafe { libc::kill(pid as libc::pid_t, sig) };
        if ret == 0 {
            ToolCallResult::success(
                json!({
                    "pid": pid,
                    "signal": sig_name,
                    "status": "terminated"
                })
                .to_string(),
            )
        } else {
            let err = std::io::Error::last_os_error();
            ToolCallResult::error(format!("Failed to send {sig_name} to PID {pid}: {err}"))
        }
    }

    #[cfg(not(unix))]
    {
        ToolCallResult::error("terminate_process is only implemented on Unix")
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
    let tmp_file = std::env::temp_dir().join(format!(
        "fam_code_{}_{}.{}",
        std::process::id(),
        now_nanos,
        extension
    ));

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
    cmd.arg(&tmp_file).stdin(std::process::Stdio::null());

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

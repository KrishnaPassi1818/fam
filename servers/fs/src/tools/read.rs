use crate::confinement::Confinement;
use crate::protocol::{ToolCallResult, ToolDefinition};
use base64::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;
use std::time::SystemTime;

#[derive(Debug, Serialize, Deserialize)]
pub struct ReadFileArgs {
    pub path: String,
    #[serde(default)]
    pub start_line: Option<usize>,
    #[serde(default)]
    pub end_line: Option<usize>,
    #[serde(default)]
    pub raw: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReadFileRangeArgs {
    pub path: String,
    pub start_line: usize,
    pub end_line: usize,
    #[serde(default)]
    pub raw: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ListDirArgs {
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub base_dir: Option<String>,
    #[serde(default)]
    pub recursive: Option<bool>,
    #[serde(default)]
    pub max_depth: Option<usize>,
    #[serde(default)]
    pub max_entries: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TreeArgs {
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub depth: Option<usize>,
    #[serde(default)]
    pub max_entries: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfoArgs {
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExistsArgs {
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReadBinaryArgs {
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReadMultipleArgs {
    pub paths: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompareFilesArgs {
    pub path_a: String,
    pub path_b: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileHashArgs {
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub paths: Option<Vec<String>>,
}

pub fn tool_definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "read_file".into(),
            description:
                "Read contents of a file within a bounded line range (1-indexed inclusive). Set raw: true for unformatted file content without line numbers.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Relative or absolute path to the file" },
                    "start_line": { "type": "integer", "description": "Optional starting line number (1-based)" },
                    "end_line": { "type": "integer", "description": "Optional ending line number (1-based)" },
                    "raw": { "type": "boolean", "description": "Optional. If true, returns exact raw file lines without line number gutters. Default false." }
                },
                "required": ["path"]
            }),
            annotations: Some(crate::protocol::ToolAnnotation {
                read_only_hint: Some(true),
                destructive_hint: Some(false),
                idempotent_hint: Some(true),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "read_file_range".into(),
            description: "Read a specific line range from a text file (1-indexed inclusive).".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Path to file" },
                    "start_line": { "type": "integer", "description": "Starting line number (1-based)" },
                    "end_line": { "type": "integer", "description": "Ending line number (1-based)" },
                    "raw": { "type": "boolean", "description": "Optional raw output without line numbers" }
                },
                "required": ["path", "start_line", "end_line"]
            }),
            annotations: Some(crate::protocol::ToolAnnotation {
                read_only_hint: Some(true),
                destructive_hint: Some(false),
                idempotent_hint: Some(true),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "list_dir".into(),
            description:
                "List directory contents with file metadata (size, type). Set recursive=false for normal directory listing."
                    .into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Directory path (defaults to workspace root if omitted)" },
                    "recursive": { "type": "boolean", "description": "Whether to list recursively (default false). Keep false unless deep recursion is needed." },
                    "max_depth": { "type": "integer", "description": "Maximum directory depth when recursive (default 1)" },
                    "max_entries": { "type": "integer", "description": "Maximum number of entries to return (default 200)" }
                }
            }),
            annotations: Some(crate::protocol::ToolAnnotation {
                read_only_hint: Some(true),
                destructive_hint: Some(false),
                idempotent_hint: Some(true),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "tree".into(),
            description: "Generate a formatted visual ASCII directory tree up to a specified depth.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Directory path to inspect (defaults to workspace)" },
                    "depth": { "type": "integer", "description": "Maximum tree depth (default: 3)" },
                    "max_entries": { "type": "integer", "description": "Maximum total files/directories to include (default: 200)" }
                }
            }),
            annotations: Some(crate::protocol::ToolAnnotation {
                read_only_hint: Some(true),
                destructive_hint: Some(false),
                idempotent_hint: Some(true),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "file_info".into(),
            description:
                "Get detailed file metadata: size, type, timestamps, permissions, SHA-256 hash, and line count."
                    .into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Path to inspect" }
                },
                "required": ["path"]
            }),
            annotations: Some(crate::protocol::ToolAnnotation {
                read_only_hint: Some(true),
                destructive_hint: Some(false),
                idempotent_hint: Some(true),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "get_file_metadata".into(),
            description: "Get comprehensive metadata for a file or directory (size, permissions, timestamps, hash).".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Path to inspect" }
                },
                "required": ["path"]
            }),
            annotations: Some(crate::protocol::ToolAnnotation {
                read_only_hint: Some(true),
                destructive_hint: Some(false),
                idempotent_hint: Some(true),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "exists".into(),
            description: "Check if a file or directory exists at the given path, returning whether it is a file or directory.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Path to check for existence" }
                },
                "required": ["path"]
            }),
            annotations: Some(crate::protocol::ToolAnnotation {
                read_only_hint: Some(true),
                destructive_hint: Some(false),
                idempotent_hint: Some(true),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "read_binary".into(),
            description: "Read a binary file (images, PDFs, documents, archives) and return Base64-encoded content.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Path to the binary file" }
                },
                "required": ["path"]
            }),
            annotations: Some(crate::protocol::ToolAnnotation {
                read_only_hint: Some(true),
                destructive_hint: Some(false),
                idempotent_hint: Some(true),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "read_multiple".into(),
            description: "Read multiple text files in a single tool call, returning their contents and metadata.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "paths": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Array of file paths to read"
                    }
                },
                "required": ["paths"]
            }),
            annotations: Some(crate::protocol::ToolAnnotation {
                read_only_hint: Some(true),
                destructive_hint: Some(false),
                idempotent_hint: Some(true),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "compare_files".into(),
            description: "Compare two files and return whether they are identical along with line-by-line differences.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path_a": { "type": "string", "description": "First file path" },
                    "path_b": { "type": "string", "description": "Second file path" }
                },
                "required": ["path_a", "path_b"]
            }),
            annotations: Some(crate::protocol::ToolAnnotation {
                read_only_hint: Some(true),
                destructive_hint: Some(false),
                idempotent_hint: Some(true),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "file_hash".into(),
            description:
                "Compute SHA-256 content hashes and sizes for one or more files to compare duplicates."
                    .into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Single file path or glob pattern" },
                    "paths": { "type": "array", "items": { "type": "string" }, "description": "List of file paths or glob patterns" }
                }
            }),
            annotations: Some(crate::protocol::ToolAnnotation {
                read_only_hint: Some(true),
                destructive_hint: Some(false),
                idempotent_hint: Some(true),
                open_world_hint: Some(false),
            }),
        },
    ]
}

pub fn execute_read_file(conf: &Confinement, args: ReadFileArgs) -> ToolCallResult {
    let resolved = match conf.resolve(&args.path) {
        Ok(p) => p,
        Err(err) => return ToolCallResult::error(err.to_string()),
    };

    if !resolved.exists() {
        return ToolCallResult::error(format!("File '{}' does not exist", args.path));
    }

    if !resolved.is_file() {
        return ToolCallResult::error(format!("Path '{}' is not a file", args.path));
    }

    let bytes = match fs::read(&resolved) {
        Ok(b) => b,
        Err(err) => {
            return ToolCallResult::error(format!("Failed to read file '{}': {err}", args.path))
        }
    };

    // Check binary (look for null byte in first 8KB)
    if bytes.iter().take(8192).any(|&b| b == 0) {
        return ToolCallResult::error(format!(
            "Cannot read binary file '{}' ({} bytes). Use read_binary instead.",
            args.path,
            bytes.len()
        ));
    }

    let content = match String::from_utf8(bytes) {
        Ok(s) => s,
        Err(_) => {
            return ToolCallResult::error(format!(
                "File '{}' is not valid UTF-8. Use read_binary.",
                args.path
            ))
        }
    };

    let all_lines: Vec<&str> = content.lines().collect();
    let total_lines = all_lines.len();

    let start = args.start_line.unwrap_or(1).max(1);
    let end = args.end_line.unwrap_or(total_lines).min(total_lines);

    let selected_lines = if start <= end && start <= total_lines {
        all_lines[start - 1..end].to_vec()
    } else {
        Vec::new()
    };

    let is_raw = args.raw.unwrap_or(false);
    let mut out = String::new();
    for (idx, line) in selected_lines.iter().enumerate() {
        if is_raw {
            out.push_str(line);
            out.push('\n');
        } else {
            let line_num = start + idx;
            out.push_str(&format!("{line_num:4} | {line}\n"));
        }
    }

    let truncated = selected_lines.len() < total_lines;

    let res_json = json!({
        "path": conf.relative_display(&resolved).to_string_lossy(),
        "start_line": start,
        "end_line": end,
        "total_lines": total_lines,
        "lines_returned": selected_lines.len(),
        "truncated": truncated,
        "content": out
    });

    ToolCallResult::success(res_json.to_string())
}

pub fn execute_read_file_range(conf: &Confinement, args: ReadFileRangeArgs) -> ToolCallResult {
    execute_read_file(
        conf,
        ReadFileArgs {
            path: args.path,
            start_line: Some(args.start_line),
            end_line: Some(args.end_line),
            raw: args.raw,
        },
    )
}

#[derive(Debug, Serialize)]
struct DirEntry {
    name: String,
    path: String,
    absolute_path: String,
    is_dir: bool,
    size_bytes: u64,
}

pub fn execute_list_dir(conf: &Confinement, args: ListDirArgs) -> ToolCallResult {
    let target_path = args
        .path
        .as_deref()
        .or(args.base_dir.as_deref())
        .unwrap_or(".");
    let resolved = match conf.resolve(target_path) {
        Ok(p) => p,
        Err(err) => return ToolCallResult::error(err.to_string()),
    };

    if !resolved.exists() {
        return ToolCallResult::error(format!("Directory '{}' does not exist", target_path));
    }

    if !resolved.is_dir() {
        return ToolCallResult::error(format!("Path '{}' is not a directory", target_path));
    }

    let recursive = args.recursive.unwrap_or(false);
    let max_depth = if recursive {
        args.max_depth.unwrap_or(3)
    } else {
        1
    };
    let max_entries = args.max_entries.unwrap_or(200);

    let mut entries = Vec::new();
    let mut truncated = false;

    if recursive {
        for entry in walkdir::WalkDir::new(&resolved)
            .min_depth(1)
            .max_depth(max_depth)
            .into_iter()
            .filter_entry(|e| {
                let name = e.file_name().to_string_lossy();
                name != ".git" && name != "node_modules" && name != "target"
            })
        {
            if entries.len() >= max_entries {
                truncated = true;
                break;
            }
            if let Ok(e) = entry {
                let p = e.path();
                let meta = match e.metadata() {
                    Ok(m) => m,
                    Err(_) => continue,
                };
                entries.push(DirEntry {
                    name: e.file_name().to_string_lossy().to_string(),
                    path: conf.relative_display(p).to_string_lossy().to_string(),
                    absolute_path: p.to_string_lossy().to_string(),
                    is_dir: meta.is_dir(),
                    size_bytes: meta.len(),
                });
            }
        }
    } else {
        let read_dir = match fs::read_dir(&resolved) {
            Ok(rd) => rd,
            Err(e) => return ToolCallResult::error(format!("Failed to read directory: {e}")),
        };

        for item in read_dir {
            if entries.len() >= max_entries {
                truncated = true;
                break;
            }
            if let Ok(entry) = item {
                let p = entry.path();
                let meta = match entry.metadata() {
                    Ok(m) => m,
                    Err(_) => continue,
                };
                entries.push(DirEntry {
                    name: entry.file_name().to_string_lossy().to_string(),
                    path: conf.relative_display(&p).to_string_lossy().to_string(),
                    absolute_path: p.to_string_lossy().to_string(),
                    is_dir: meta.is_dir(),
                    size_bytes: meta.len(),
                });
            }
        }
    }

    entries.sort_by(|a, b| {
        if a.is_dir == b.is_dir {
            a.name.cmp(&b.name)
        } else if a.is_dir {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        }
    });

    let res_json = json!({
        "directory": conf.relative_display(&resolved).to_string_lossy(),
        "absolute_path": resolved.to_string_lossy(),
        "total_entries": entries.len(),
        "truncated": truncated,
        "entries": entries
    });

    ToolCallResult::success(res_json.to_string())
}

pub fn execute_tree(conf: &Confinement, args: TreeArgs) -> ToolCallResult {
    let target_path = args.path.as_deref().unwrap_or(".");
    let resolved = match conf.resolve(target_path) {
        Ok(p) => p,
        Err(err) => return ToolCallResult::error(err.to_string()),
    };

    if !resolved.exists() {
        return ToolCallResult::error(format!("Path '{}' does not exist", target_path));
    }

    let max_depth = args.depth.unwrap_or(3);
    let max_entries = args.max_entries.unwrap_or(200);

    let mut tree_lines = Vec::new();
    tree_lines.push(format!("{}/", conf.relative_display(&resolved).display()));

    let mut count = 0;
    let mut truncated = false;

    #[allow(clippy::too_many_arguments)]
    fn build_tree(
        dir: &Path,
        prefix: &str,
        depth: usize,
        max_depth: usize,
        lines: &mut Vec<String>,
        count: &mut usize,
        max_entries: usize,
        truncated: &mut bool,
    ) {
        if depth > max_depth || *count >= max_entries {
            if *count >= max_entries {
                *truncated = true;
            }
            return;
        }

        let mut entries = Vec::new();
        if let Ok(rd) = fs::read_dir(dir) {
            for item in rd.flatten() {
                let name = item.file_name().to_string_lossy().to_string();
                if name == ".git" || name == "node_modules" || name == "target" {
                    continue;
                }
                entries.push(item);
            }
        }

        entries.sort_by_key(|e| e.file_name());
        let total = entries.len();

        for (i, entry) in entries.iter().enumerate() {
            if *count >= max_entries {
                *truncated = true;
                break;
            }
            *count += 1;
            let is_last = i == total - 1;
            let connector = if is_last { "└── " } else { "├── " };
            let file_name = entry.file_name().to_string_lossy().to_string();
            let p = entry.path();
            let is_dir = p.is_dir();

            let suffix = if is_dir { "/" } else { "" };
            lines.push(format!("{}{}{}{}", prefix, connector, file_name, suffix));

            if is_dir {
                let new_prefix = format!("{}{}", prefix, if is_last { "    " } else { "│   " });
                build_tree(
                    &p,
                    &new_prefix,
                    depth + 1,
                    max_depth,
                    lines,
                    count,
                    max_entries,
                    truncated,
                );
            }
        }
    }

    build_tree(
        &resolved,
        "",
        1,
        max_depth,
        &mut tree_lines,
        &mut count,
        max_entries,
        &mut truncated,
    );

    let res_json = json!({
        "path": conf.relative_display(&resolved).to_string_lossy(),
        "total_nodes": count,
        "truncated": truncated,
        "tree": tree_lines.join("\n")
    });

    ToolCallResult::success(res_json.to_string())
}

pub fn execute_file_info(conf: &Confinement, args: FileInfoArgs) -> ToolCallResult {
    let resolved = match conf.resolve(&args.path) {
        Ok(p) => p,
        Err(err) => return ToolCallResult::error(err.to_string()),
    };

    if !resolved.exists() {
        return ToolCallResult::error(format!("Path '{}' does not exist", args.path));
    }

    let meta = match fs::metadata(&resolved) {
        Ok(m) => m,
        Err(err) => return ToolCallResult::error(format!("Failed to read metadata: {err}")),
    };

    let is_file = meta.is_file();
    let size_bytes = meta.len();
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_secs());

    let mut line_count = None;
    let mut hash_hex = None;

    if is_file && size_bytes <= 10 * 1024 * 1024 {
        if let Ok(bytes) = fs::read(&resolved) {
            let mut hasher = Sha256::new();
            hasher.update(&bytes);
            hash_hex = Some(format!("{:x}", hasher.finalize()));

            if !bytes.iter().take(8192).any(|&b| b == 0) {
                if let Ok(s) = String::from_utf8(bytes) {
                    line_count = Some(s.lines().count());
                }
            }
        }
    }

    let res_json = json!({
        "path": conf.relative_display(&resolved).to_string_lossy(),
        "exists": true,
        "is_file": is_file,
        "is_dir": meta.is_dir(),
        "size_bytes": size_bytes,
        "line_count": line_count,
        "sha256": hash_hex,
        "modified_timestamp": modified,
        "readonly": meta.permissions().readonly()
    });

    ToolCallResult::success(res_json.to_string())
}

pub fn execute_exists(conf: &Confinement, args: ExistsArgs) -> ToolCallResult {
    let resolved = match conf.resolve(&args.path) {
        Ok(p) => p,
        Err(e) => {
            return ToolCallResult::success(
                json!({
                    "path": args.path,
                    "exists": false,
                    "is_file": false,
                    "is_dir": false,
                    "error": e.to_string()
                })
                .to_string(),
            );
        }
    };

    let exists = resolved.exists();
    let is_file = resolved.is_file();
    let is_dir = resolved.is_dir();
    let size = if exists {
        fs::metadata(&resolved).map(|m| m.len()).ok()
    } else {
        None
    };

    let res_json = json!({
        "path": conf.relative_display(&resolved).to_string_lossy(),
        "exists": exists,
        "is_file": is_file,
        "is_dir": is_dir,
        "size_bytes": size
    });

    ToolCallResult::success(res_json.to_string())
}

pub fn execute_read_binary(conf: &Confinement, args: ReadBinaryArgs) -> ToolCallResult {
    let resolved = match conf.resolve(&args.path) {
        Ok(p) => p,
        Err(err) => return ToolCallResult::error(err.to_string()),
    };

    if !resolved.exists() {
        return ToolCallResult::error(format!("Binary file '{}' does not exist", args.path));
    }
    if !resolved.is_file() {
        return ToolCallResult::error(format!("Path '{}' is not a file", args.path));
    }

    let bytes = match fs::read(&resolved) {
        Ok(b) => b,
        Err(e) => return ToolCallResult::error(format!("Failed to read binary file: {e}")),
    };

    let encoded = BASE64_STANDARD.encode(&bytes);

    let res_json = json!({
        "path": conf.relative_display(&resolved).to_string_lossy(),
        "size_bytes": bytes.len(),
        "content_base64": encoded
    });

    ToolCallResult::success(res_json.to_string())
}

pub fn execute_read_multiple(conf: &Confinement, args: ReadMultipleArgs) -> ToolCallResult {
    let mut results = Vec::new();

    for p in args.paths.into_iter().take(20) {
        match conf.resolve(&p) {
            Ok(resolved) => {
                if !resolved.exists() {
                    results.push(json!({
                        "path": p,
                        "exists": false,
                        "is_error": true,
                        "error": "File does not exist"
                    }));
                } else if !resolved.is_file() {
                    results.push(json!({
                        "path": p,
                        "is_dir": true,
                        "is_error": true,
                        "error": "Path is a directory, not a file"
                    }));
                } else {
                    match fs::read(&resolved) {
                        Ok(bytes) => {
                            let is_bin = bytes.iter().take(8192).any(|&b| b == 0);
                            if is_bin {
                                results.push(json!({
                                    "path": conf.relative_display(&resolved).to_string_lossy(),
                                    "size_bytes": bytes.len(),
                                    "is_binary": true,
                                    "is_error": false,
                                    "content_base64": BASE64_STANDARD.encode(&bytes)
                                }));
                            } else {
                                let content = String::from_utf8_lossy(&bytes).to_string();
                                results.push(json!({
                                    "path": conf.relative_display(&resolved).to_string_lossy(),
                                    "size_bytes": bytes.len(),
                                    "is_binary": false,
                                    "is_error": false,
                                    "content": content
                                }));
                            }
                        }
                        Err(e) => {
                            results.push(json!({
                                "path": p,
                                "is_error": true,
                                "error": e.to_string()
                            }));
                        }
                    }
                }
            }
            Err(e) => {
                results.push(json!({
                    "path": p,
                    "is_error": true,
                    "error": e.to_string()
                }));
            }
        }
    }

    let res_json = json!({
        "files_count": results.len(),
        "files": results
    });

    ToolCallResult::success(res_json.to_string())
}

pub fn execute_compare_files(conf: &Confinement, args: CompareFilesArgs) -> ToolCallResult {
    let res_a = match conf.resolve(&args.path_a) {
        Ok(p) => p,
        Err(e) => return ToolCallResult::error(format!("Path A error: {e}")),
    };
    let res_b = match conf.resolve(&args.path_b) {
        Ok(p) => p,
        Err(e) => return ToolCallResult::error(format!("Path B error: {e}")),
    };

    if !res_a.exists() {
        return ToolCallResult::error(format!("File A '{}' does not exist", args.path_a));
    }
    if !res_b.exists() {
        return ToolCallResult::error(format!("File B '{}' does not exist", args.path_b));
    }

    let bytes_a = match fs::read(&res_a) {
        Ok(b) => b,
        Err(e) => return ToolCallResult::error(format!("Failed to read File A: {e}")),
    };
    let bytes_b = match fs::read(&res_b) {
        Ok(b) => b,
        Err(e) => return ToolCallResult::error(format!("Failed to read File B: {e}")),
    };

    let identical = bytes_a == bytes_b;
    let mut diff_lines = Vec::new();

    if !identical {
        let text_a = String::from_utf8_lossy(&bytes_a);
        let text_b = String::from_utf8_lossy(&bytes_b);
        let lines_a: Vec<&str> = text_a.lines().collect();
        let lines_b: Vec<&str> = text_b.lines().collect();

        let max_len = lines_a.len().max(lines_b.len());
        for i in 0..max_len.min(50) {
            let l_a = lines_a.get(i);
            let l_b = lines_b.get(i);
            if l_a != l_b {
                if let Some(la) = l_a {
                    diff_lines.push(format!("- Line {}: {}", i + 1, la));
                }
                if let Some(lb) = l_b {
                    diff_lines.push(format!("+ Line {}: {}", i + 1, lb));
                }
            }
        }
    }

    let res_json = json!({
        "path_a": conf.relative_display(&res_a).to_string_lossy(),
        "path_b": conf.relative_display(&res_b).to_string_lossy(),
        "identical": identical,
        "size_a": bytes_a.len(),
        "size_b": bytes_b.len(),
        "diff_summary": diff_lines.join("\n")
    });

    ToolCallResult::success(res_json.to_string())
}

pub fn execute_file_hash(conf: &Confinement, args: FileHashArgs) -> ToolCallResult {
    let mut target_paths = Vec::new();
    if let Some(p) = args.path {
        target_paths.push(p);
    }
    if let Some(ps) = args.paths {
        target_paths.extend(ps);
    }

    if target_paths.is_empty() {
        return ToolCallResult::error("Must provide either 'path' or 'paths' parameter");
    }

    let mut hashes = Vec::new();

    for p_str in target_paths {
        let p_clean = p_str.trim();
        if p_clean.contains('*') || p_clean.contains('?') {
            let base = conf.workspace().to_path_buf();
            let pat = match glob::Pattern::new(p_clean) {
                Ok(pat) => pat,
                Err(e) => return ToolCallResult::error(format!("Invalid glob pattern: {e}")),
            };

            for entry in walkdir::WalkDir::new(&base)
                .min_depth(1)
                .into_iter()
                .filter_entry(|e| {
                    let name = e.file_name().to_string_lossy();
                    name != ".git" && name != "node_modules" && name != "target"
                })
                .flatten()
            {
                if entry.path().is_file() {
                    let rel = conf.relative_display(entry.path());
                    let rel_str = rel.to_string_lossy();
                    if pat.matches(&rel_str) || pat.matches_path(entry.path()) {
                        if let Ok(bytes) = fs::read(entry.path()) {
                            let mut hasher = Sha256::new();
                            hasher.update(&bytes);
                            let h = format!("{:x}", hasher.finalize());
                            hashes.push(json!({
                                "path": rel_str,
                                "size_bytes": bytes.len(),
                                "sha256": h
                            }));
                        }
                    }
                }
            }
        } else {
            let resolved = match conf.resolve(p_clean) {
                Ok(p) => p,
                Err(_) => continue,
            };

            if resolved.is_file() {
                if let Ok(bytes) = fs::read(&resolved) {
                    let mut hasher = Sha256::new();
                    hasher.update(&bytes);
                    let h = format!("{:x}", hasher.finalize());
                    hashes.push(json!({
                        "path": conf.relative_display(&resolved).to_string_lossy(),
                        "size_bytes": bytes.len(),
                        "sha256": h
                    }));
                }
            }
        }
    }

    let res_json = json!({
        "files_hashed": hashes.len(),
        "hashes": hashes
    });

    ToolCallResult::success(res_json.to_string())
}

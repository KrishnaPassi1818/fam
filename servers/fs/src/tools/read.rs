use crate::confinement::Confinement;
use crate::protocol::{ToolCallResult, ToolDefinition};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct ReadFileArgs {
    pub path: String,
    #[serde(default)]
    pub start_line: Option<usize>,
    #[serde(default)]
    pub end_line: Option<usize>,
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
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileInfoArgs {
    pub path: String,
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
                "Read contents of a file within a bounded line range (1-indexed inclusive).".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Relative or absolute path to the file" },
                    "start_line": { "type": "integer", "description": "Optional starting line number (1-based)" },
                    "end_line": { "type": "integer", "description": "Optional ending line number (1-based)" }
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
            name: "list_dir".into(),
            description:
                "List directory contents with file metadata (size, type). Set recursive=false for normal directory listing."
                    .into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Directory path (defaults to root if omitted)" },
                    "recursive": { "type": "boolean", "description": "Whether to list recursively (default false). Keep false unless deep recursion is needed." },
                    "max_depth": { "type": "integer", "description": "Maximum directory depth when recursive (default 1)" }
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
            name: "file_hash".into(),
            description:
                "Compute SHA-256 content hashes and sizes for one or more files to compare duplicates."
                    .into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Single file path" },
                    "paths": { "type": "array", "items": { "type": "string" }, "description": "List of file paths" }
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

    if !resolved.is_file() {
        return ToolCallResult::error(format!("Path '{}' is not a file", args.path));
    }

    let bytes = match fs::read(&resolved) {
        Ok(b) => b,
        Err(err) => return ToolCallResult::error(format!("Failed to read file: {err}")),
    };

    // Check binary (look for null byte in first 8KB)
    if bytes.iter().take(8192).any(|&b| b == 0) {
        return ToolCallResult::error(format!(
            "Cannot read binary file '{}' ({} bytes)",
            args.path,
            bytes.len()
        ));
    }

    let content = match String::from_utf8(bytes) {
        Ok(s) => s,
        Err(_) => return ToolCallResult::error(format!("File '{}' is not valid UTF-8", args.path)),
    };

    let all_lines: Vec<&str> = content.lines().collect();
    let total_lines = all_lines.len();

    let start = args.start_line.unwrap_or(1).max(1);
    let end = args.end_line.unwrap_or(total_lines).min(total_lines);

    if start > total_lines && total_lines > 0 {
        return ToolCallResult::error(format!(
            "Start line {} exceeds total line count ({}) in '{}'",
            start, total_lines, args.path
        ));
    }

    let selected_lines = if total_lines == 0 {
        Vec::new()
    } else if start <= end {
        all_lines[start - 1..end].to_vec()
    } else {
        Vec::new()
    };

    let mut out = String::new();
    for (idx, line) in selected_lines.iter().enumerate() {
        let line_num = start + idx;
        out.push_str(&format!("{line_num:4} | {line}\n"));
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

#[derive(Debug, Serialize)]
struct DirEntryInfo {
    name: String,
    path: String,
    is_dir: bool,
    is_file: bool,
    is_symlink: bool,
    size: u64,
}

pub fn execute_list_dir(conf: &Confinement, args: ListDirArgs) -> ToolCallResult {
    let p_opt = args.path.as_deref().or(args.base_dir.as_deref());
    let target_dir = match p_opt {
        Some(p) => match conf.resolve(p) {
            Ok(resolved) => resolved,
            Err(e) => return ToolCallResult::error(e.to_string()),
        },
        None => conf.resolve(".").unwrap_or_else(|_| conf.root().to_path_buf()),
    };

    if !target_dir.is_dir() {
        return ToolCallResult::error(format!("'{}' is not a directory", target_dir.display()));
    }

    let recursive = args.recursive.unwrap_or(false);
    let max_depth = args.max_depth.unwrap_or(if recursive { 4 } else { 1 });

    let mut entries = Vec::new();
    if let Err(e) = walk_dir(&target_dir, conf, 1, max_depth, &mut entries) {
        return ToolCallResult::error(e.to_string());
    }

    let total_found = entries.len();
    let max_entries = 100;
    let truncated = total_found > max_entries;
    if truncated {
        entries.truncate(max_entries);
    }

    let mut lines = Vec::new();
    for e in &entries {
        let kind = if e.is_dir { "DIR" } else { "FILE" };
        lines.push(format!("{kind:<5} {:>10} B  {}", e.size, e.name));
    }
    let text_view = lines.join("\n");

    let res_json = json!({
        "dir": conf.relative_display(&target_dir).to_string_lossy(),
        "total_entries": total_found,
        "returned_entries": entries.len(),
        "truncated": truncated,
        "listing": text_view,
        "entries": entries
    });

    ToolCallResult::success(res_json.to_string())
}

fn walk_dir(
    dir: &Path,
    conf: &Confinement,
    current_depth: usize,
    max_depth: usize,
    entries: &mut Vec<DirEntryInfo>,
) -> Result<()> {
    let read_dir =
        fs::read_dir(dir).with_context(|| format!("Reading directory {}", dir.display()))?;

    for item in read_dir {
        let entry = match item {
            Ok(e) => e,
            Err(_) => continue,
        };
        let p = entry.path();
        let ft = entry.file_type()?;

        let is_dir = ft.is_dir();
        let is_file = ft.is_file();
        let is_symlink = ft.is_symlink();

        let fname = entry.file_name();
        let fname_str = fname.to_string_lossy();
        if is_dir && (fname_str == ".git" || fname_str == "node_modules" || fname_str == "target") {
            continue;
        }

        let size = if is_file {
            entry.metadata().map(|m| m.len()).unwrap_or(0)
        } else {
            0
        };

        entries.push(DirEntryInfo {
            name: fname_str.to_string(),
            path: conf.relative_display(&p).to_string_lossy().to_string(),
            is_dir,
            is_file,
            is_symlink,
            size,
        });

        if is_dir && current_depth < max_depth {
            let _ = walk_dir(&p, conf, current_depth + 1, max_depth, entries);
        }
    }

    Ok(())
}

pub fn execute_file_info(conf: &Confinement, args: FileInfoArgs) -> ToolCallResult {
    let resolved = match conf.resolve(&args.path) {
        Ok(p) => p,
        Err(e) => return ToolCallResult::error(e.to_string()),
    };

    let meta = match fs::symlink_metadata(&resolved) {
        Ok(m) => m,
        Err(e) => return ToolCallResult::error(format!("Failed to stat '{}': {e}", args.path)),
    };

    let is_dir = meta.is_dir();
    let is_file = meta.is_file();
    let is_symlink = meta.file_type().is_symlink();
    let size = meta.len();

    let mut line_count = None;
    let mut sha256 = None;
    if is_file && size < 100 * 1024 * 1024 {
        if let Ok(bytes) = fs::read(&resolved) {
            use sha2::{Digest, Sha256};
            let mut hasher = Sha256::new();
            hasher.update(&bytes);
            sha256 = Some(format!("{:x}", hasher.finalize()));

            if size < 10 * 1024 * 1024 && !bytes.iter().take(8192).any(|&b| b == 0) {
                if let Ok(s) = std::str::from_utf8(&bytes) {
                    line_count = Some(s.lines().count());
                }
            }
        }
    }

    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs());

    let res_json = json!({
        "path": conf.relative_display(&resolved).to_string_lossy(),
        "is_file": is_file,
        "is_dir": is_dir,
        "is_symlink": is_symlink,
        "size_bytes": size,
        "line_count": line_count,
        "sha256": sha256,
        "modified_epoch_sec": modified,
        "readonly": meta.permissions().readonly(),
    });

    ToolCallResult::success(res_json.to_string())
}

pub fn execute_file_hash(conf: &Confinement, args: FileHashArgs) -> ToolCallResult {
    use sha2::{Digest, Sha256};

    let mut target_paths = Vec::new();
    if let Some(p) = args.path {
        target_paths.push(p);
    }
    if let Some(ps) = args.paths {
        target_paths.extend(ps);
    }

    if target_paths.is_empty() {
        return ToolCallResult::error("Must provide 'path' or 'paths' to file_hash");
    }

    let mut results = Vec::new();
    for p_str in target_paths {
        let resolved = match conf.resolve(&p_str) {
            Ok(p) => p,
            Err(e) => {
                results.push(json!({ "path": p_str, "error": e.to_string() }));
                continue;
            }
        };

        match fs::read(&resolved) {
            Ok(bytes) => {
                let mut hasher = Sha256::new();
                hasher.update(&bytes);
                let hash_hex = format!("{:x}", hasher.finalize());
                results.push(json!({
                    "path": conf.relative_display(&resolved).to_string_lossy(),
                    "size_bytes": bytes.len(),
                    "sha256": hash_hex
                }));
            }
            Err(e) => {
                results.push(json!({ "path": p_str, "error": e.to_string() }));
            }
        }
    }

    ToolCallResult::success(json!({ "hashes": results }).to_string())
}

use crate::confinement::Confinement;
use crate::protocol::{ToolCallResult, ToolDefinition};
use anyhow::{bail, Result};
use base64::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct WriteFileArgs {
    pub path: String,
    pub content: String,
    #[serde(default)]
    pub overwrite: Option<bool>,
    #[serde(default)]
    pub append: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateFileArgs {
    pub path: String,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub overwrite: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateDirectoryArgs {
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AppendFileArgs {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchReplaceBlock {
    pub search: String,
    pub replace: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApplyEditArgs {
    pub path: String,
    #[serde(default)]
    pub edits: Option<Vec<SearchReplaceBlock>>,
    #[serde(default)]
    pub search: Option<String>,
    #[serde(default)]
    pub replace: Option<String>,
    #[serde(default)]
    pub dry_run: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApplyPatchArgs {
    pub path: String,
    pub patch: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WriteBinaryArgs {
    pub path: String,
    pub content_base64: String,
    #[serde(default)]
    pub overwrite: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ReplaceFileArgs {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CopyArgs {
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub from: Option<String>,
    #[serde(default)]
    pub destination: Option<String>,
    #[serde(default)]
    pub to: Option<String>,
    #[serde(default)]
    pub overwrite: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MoveArgs {
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub from: Option<String>,
    #[serde(default)]
    pub destination: Option<String>,
    #[serde(default)]
    pub to: Option<String>,
    #[serde(default)]
    pub overwrite: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RenameArgs {
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
    pub new_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TrashArgs {
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DeleteArgs {
    pub path: String,
    #[serde(default)]
    pub recursive: Option<bool>,
    #[serde(default)]
    pub dry_run: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BatchOperation {
    pub op: String, // "write", "create_file", "create_dir", "copy", "move", "delete", "append"
    pub path: Option<String>,
    pub content: Option<String>,
    pub source: Option<String>,
    pub destination: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BatchOperationsArgs {
    pub operations: Vec<BatchOperation>,
}

pub fn tool_definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "write_file".into(),
            description: "Write content to a file, automatically creating parent directories.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "File path to write" },
                    "content": { "type": "string", "description": "Full file content" },
                    "overwrite": { "type": "boolean", "description": "Whether to overwrite existing file (default true)" },
                    "append": { "type": "boolean", "description": "Whether to append to file instead of overwriting (default false)" }
                },
                "required": ["path", "content"]
            }),
            annotations: Some(crate::protocol::ToolAnnotation {
                read_only_hint: Some(false),
                destructive_hint: Some(false),
                idempotent_hint: Some(true),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "create_file".into(),
            description: "Create a new file at path with optional initial content.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Path to create file at" },
                    "content": { "type": "string", "description": "Optional initial content" },
                    "overwrite": { "type": "boolean", "description": "Whether to overwrite if file exists (default false)" }
                },
                "required": ["path"]
            }),
            annotations: Some(crate::protocol::ToolAnnotation {
                read_only_hint: Some(false),
                destructive_hint: Some(false),
                idempotent_hint: Some(true),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "create_directory".into(),
            description: "Create a directory and any necessary parent directories (like mkdir -p).".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Directory path to create" }
                },
                "required": ["path"]
            }),
            annotations: Some(crate::protocol::ToolAnnotation {
                read_only_hint: Some(false),
                destructive_hint: Some(false),
                idempotent_hint: Some(true),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "append_file".into(),
            description: "Append content to an existing or new file.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "File path to append to" },
                    "content": { "type": "string", "description": "Content string to append" }
                },
                "required": ["path", "content"]
            }),
            annotations: Some(crate::protocol::ToolAnnotation {
                read_only_hint: Some(false),
                destructive_hint: Some(false),
                idempotent_hint: Some(false),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "apply_edit".into(),
            description: "Apply search/replace edits to a file with whitespace-tolerant fuzzy matching.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "File to edit" },
                    "search": { "type": "string", "description": "Exact text or pattern to find" },
                    "replace": { "type": "string", "description": "Replacement text" },
                    "edits": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "search": { "type": "string" },
                                "replace": { "type": "string" }
                            },
                            "required": ["search", "replace"]
                        },
                        "description": "Optional list of search/replace blocks"
                    },
                    "dry_run": { "type": "boolean", "description": "Preview modifications without writing to disk" }
                },
                "required": ["path"]
            }),
            annotations: Some(crate::protocol::ToolAnnotation {
                read_only_hint: Some(false),
                destructive_hint: Some(false),
                idempotent_hint: Some(false),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "apply_patch".into(),
            description: "Apply a unified diff or patch text to a file.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Target file to patch" },
                    "patch": { "type": "string", "description": "Diff or patch string to apply" }
                },
                "required": ["path", "patch"]
            }),
            annotations: Some(crate::protocol::ToolAnnotation {
                read_only_hint: Some(false),
                destructive_hint: Some(false),
                idempotent_hint: Some(false),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "write_binary".into(),
            description: "Write Base64-encoded binary data to a file (images, documents, archives).".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Destination file path" },
                    "content_base64": { "type": "string", "description": "Base64 encoded binary data" },
                    "overwrite": { "type": "boolean", "description": "Whether to overwrite existing file (default true)" }
                },
                "required": ["path", "content_base64"]
            }),
            annotations: Some(crate::protocol::ToolAnnotation {
                read_only_hint: Some(false),
                destructive_hint: Some(false),
                idempotent_hint: Some(true),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "replace_file".into(),
            description: "Replace the entire content of an existing file atomically.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Path to file" },
                    "content": { "type": "string", "description": "New content" }
                },
                "required": ["path", "content"]
            }),
            annotations: Some(crate::protocol::ToolAnnotation {
                read_only_hint: Some(false),
                destructive_hint: Some(false),
                idempotent_hint: Some(true),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "copy".into(),
            description: "Copy a file or directory from source to destination.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "source": { "type": "string", "description": "Source file or directory path" },
                    "destination": { "type": "string", "description": "Destination path" },
                    "overwrite": { "type": "boolean", "description": "Whether to overwrite destination (default false)" }
                },
                "required": ["source", "destination"]
            }),
            annotations: Some(crate::protocol::ToolAnnotation {
                read_only_hint: Some(false),
                destructive_hint: Some(false),
                idempotent_hint: Some(true),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "move".into(),
            description: "Move or rename a file or directory.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "source": { "type": "string", "description": "Source path" },
                    "destination": { "type": "string", "description": "Destination path" },
                    "overwrite": { "type": "boolean", "description": "Whether to overwrite destination (default false)" }
                },
                "required": ["source", "destination"]
            }),
            annotations: Some(crate::protocol::ToolAnnotation {
                read_only_hint: Some(false),
                destructive_hint: Some(true),
                idempotent_hint: Some(false),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "rename".into(),
            description: "Rename a file or directory in place with a new name.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Current file/directory path" },
                    "new_name": { "type": "string", "description": "New file or directory name (basename only)" }
                },
                "required": ["path", "new_name"]
            }),
            annotations: Some(crate::protocol::ToolAnnotation {
                read_only_hint: Some(false),
                destructive_hint: Some(true),
                idempotent_hint: Some(false),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "trash".into(),
            description: "Safely move a file or directory to the operating system trash.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Path to trash" }
                },
                "required": ["path"]
            }),
            annotations: Some(crate::protocol::ToolAnnotation {
                read_only_hint: Some(false),
                destructive_hint: Some(true),
                idempotent_hint: Some(false),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "delete".into(),
            description: "Permanently delete a file or directory. Supports recursive deletion and dry-run preview.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Path to delete" },
                    "recursive": { "type": "boolean", "description": "Whether to delete directory recursively (default false)" },
                    "dry_run": { "type": "boolean", "description": "Preview deletion without modifying filesystem" }
                },
                "required": ["path"]
            }),
            annotations: Some(crate::protocol::ToolAnnotation {
                read_only_hint: Some(false),
                destructive_hint: Some(true),
                idempotent_hint: Some(false),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "batch_operations".into(),
            description: "Execute a sequence of filesystem operations atomically or sequentially.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "operations": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "op": { "type": "string", "enum": ["write", "create_file", "create_dir", "copy", "move", "delete", "append"] },
                                "path": { "type": "string" },
                                "content": { "type": "string" },
                                "source": { "type": "string" },
                                "destination": { "type": "string" }
                            },
                            "required": ["op"]
                        },
                        "description": "List of operations to execute"
                    }
                },
                "required": ["operations"]
            }),
            annotations: Some(crate::protocol::ToolAnnotation {
                read_only_hint: Some(false),
                destructive_hint: Some(true),
                idempotent_hint: Some(false),
                open_world_hint: Some(false),
            }),
        },
    ]
}

pub fn strip_line_gutters(content: &str) -> String {
    let lines: Vec<&str> = content.lines().collect();
    if lines.is_empty() {
        return content.to_string();
    }

    let gutter_re = match regex::Regex::new(r"^\s*\d+\s*\|\s?(.*)$") {
        Ok(r) => r,
        Err(_) => return content.to_string(),
    };

    let non_empty: Vec<&&str> = lines.iter().filter(|l| !l.trim().is_empty()).collect();
    if !non_empty.is_empty() && non_empty.iter().all(|l| gutter_re.is_match(l)) {
        let mut cleaned = String::new();
        for (i, line) in lines.iter().enumerate() {
            if let Some(caps) = gutter_re.captures(line) {
                cleaned.push_str(&caps[1]);
            } else {
                cleaned.push_str(line);
            }
            if i < lines.len() - 1 || content.ends_with('\n') {
                cleaned.push('\n');
            }
        }
        return cleaned;
    }
    content.to_string()
}

pub fn execute_write_file(conf: &Confinement, args: WriteFileArgs) -> ToolCallResult {
    let resolved = match conf.resolve(&args.path) {
        Ok(p) => p,
        Err(e) => return ToolCallResult::error(e.to_string()),
    };

    let cleaned_content = strip_line_gutters(&args.content);

    // If caller specified a trailing slash with empty content, treat as directory creation
    if (args.path.ends_with('/') || args.path.ends_with('\\')) && cleaned_content.is_empty() {
        if let Err(e) = fs::create_dir_all(&resolved) {
            return ToolCallResult::error(format!(
                "Failed to create directory '{}': {e}",
                args.path
            ));
        }
        let res_json = json!({
            "path": conf.relative_display(&resolved).to_string_lossy(),
            "created": true,
            "status": "success",
            "is_dir": true
        });
        return ToolCallResult::success(res_json.to_string());
    }

    if let Some(parent) = resolved.parent() {
        if !parent.exists() {
            if let Err(e) = fs::create_dir_all(parent) {
                return ToolCallResult::error(format!("Failed to create parent directory: {e}"));
            }
        }
    }

    let overwrite = args.overwrite.unwrap_or(true);
    if resolved.exists() && !overwrite && !args.append.unwrap_or(false) {
        return ToolCallResult::error(format!(
            "File '{}' already exists and overwrite is false",
            args.path
        ));
    }

    let cleaned_content = strip_line_gutters(&args.content);
    let is_append = args.append.unwrap_or(false);

    if is_append {
        use std::io::Write;
        let mut file = match fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&resolved)
        {
            Ok(f) => f,
            Err(e) => return ToolCallResult::error(format!("Failed to open file for append: {e}")),
        };
        let mut bytes_to_write = cleaned_content.clone();
        if resolved.exists()
            && fs::metadata(&resolved)
                .map(|m| m.len() > 0)
                .unwrap_or(false)
            && !bytes_to_write.starts_with('\n')
        {
            bytes_to_write = format!("\n{bytes_to_write}");
        }
        if let Err(e) = file.write_all(bytes_to_write.as_bytes()) {
            return ToolCallResult::error(format!("Failed to append to file '{}': {e}", args.path));
        }
    } else {
        if let Err(e) = fs::write(&resolved, &cleaned_content) {
            return ToolCallResult::error(format!("Failed to write file '{}': {e}", args.path));
        }
    }

    let res_json = json!({
        "path": conf.relative_display(&resolved).to_string_lossy(),
        "absolute_path": resolved.to_string_lossy(),
        "bytes_written": cleaned_content.len(),
        "status": "success"
    });

    ToolCallResult::success(res_json.to_string())
}

pub fn execute_create_file(conf: &Confinement, args: CreateFileArgs) -> ToolCallResult {
    let content = args.content.unwrap_or_default();
    execute_write_file(
        conf,
        WriteFileArgs {
            path: args.path,
            content,
            overwrite: args.overwrite.or(Some(false)),
            append: Some(false),
        },
    )
}

pub fn execute_create_directory(conf: &Confinement, args: CreateDirectoryArgs) -> ToolCallResult {
    let resolved = match conf.resolve(&args.path) {
        Ok(p) => p,
        Err(e) => return ToolCallResult::error(e.to_string()),
    };

    if resolved.exists() {
        if resolved.is_dir() {
            return ToolCallResult::success(
                json!({
                    "path": conf.relative_display(&resolved).to_string_lossy(),
                    "created": false,
                    "message": "Directory already exists"
                })
                .to_string(),
            );
        } else if let Ok(meta) = fs::metadata(&resolved) {
            if meta.is_file() && meta.len() == 0 {
                let _ = fs::remove_file(&resolved);
            } else {
                return ToolCallResult::error(format!("Path '{}' exists and is a file", args.path));
            }
        } else {
            return ToolCallResult::error(format!("Path '{}' exists and is a file", args.path));
        }
    }

    if let Err(e) = fs::create_dir_all(&resolved) {
        return ToolCallResult::error(format!("Failed to create directory '{}': {e}", args.path));
    }

    let res_json = json!({
        "path": conf.relative_display(&resolved).to_string_lossy(),
        "created": true,
        "status": "success"
    });

    ToolCallResult::success(res_json.to_string())
}

pub fn execute_append_file(conf: &Confinement, args: AppendFileArgs) -> ToolCallResult {
    execute_write_file(
        conf,
        WriteFileArgs {
            path: args.path,
            content: args.content,
            overwrite: Some(true),
            append: Some(true),
        },
    )
}

pub fn execute_write_binary(conf: &Confinement, args: WriteBinaryArgs) -> ToolCallResult {
    let resolved = match conf.resolve(&args.path) {
        Ok(p) => p,
        Err(e) => return ToolCallResult::error(e.to_string()),
    };

    if let Some(parent) = resolved.parent() {
        if !parent.exists() {
            if let Err(e) = fs::create_dir_all(parent) {
                return ToolCallResult::error(format!("Failed to create parent directory: {e}"));
            }
        }
    }

    let overwrite = args.overwrite.unwrap_or(true);
    if resolved.exists() && !overwrite {
        return ToolCallResult::error(format!(
            "File '{}' already exists and overwrite is false",
            args.path
        ));
    }

    let bytes = match BASE64_STANDARD.decode(args.content_base64.trim()) {
        Ok(b) => b,
        Err(e) => return ToolCallResult::error(format!("Invalid Base64 data: {e}")),
    };

    if let Err(e) = fs::write(&resolved, &bytes) {
        return ToolCallResult::error(format!("Failed to write binary file '{}': {e}", args.path));
    }

    let res_json = json!({
        "path": conf.relative_display(&resolved).to_string_lossy(),
        "bytes_written": bytes.len(),
        "status": "success"
    });

    ToolCallResult::success(res_json.to_string())
}

pub fn execute_replace_file(conf: &Confinement, args: ReplaceFileArgs) -> ToolCallResult {
    execute_write_file(
        conf,
        WriteFileArgs {
            path: args.path,
            content: args.content,
            overwrite: Some(true),
            append: Some(false),
        },
    )
}

pub fn execute_apply_edit(conf: &Confinement, args: ApplyEditArgs) -> ToolCallResult {
    let resolved = match conf.resolve(&args.path) {
        Ok(p) => p,
        Err(e) => return ToolCallResult::error(e.to_string()),
    };

    if !resolved.exists() {
        return ToolCallResult::error(format!("File '{}' does not exist", args.path));
    }

    let original = match fs::read_to_string(&resolved) {
        Ok(s) => s,
        Err(e) => {
            return ToolCallResult::error(format!("Failed to read file '{}': {e}", args.path))
        }
    };

    let mut edits = args.edits.unwrap_or_default();
    if let (Some(s), Some(r)) = (args.search, args.replace) {
        edits.push(SearchReplaceBlock {
            search: s,
            replace: r,
        });
    }

    if edits.is_empty() {
        return ToolCallResult::error(
            "Must provide either 'search' and 'replace', or 'edits' array",
        );
    }

    let mut current_text = original.clone();
    let mut applied_count = 0;

    for (i, edit) in edits.iter().enumerate() {
        match apply_single_block(&current_text, &edit.search, &edit.replace) {
            Ok(modified) => {
                current_text = modified;
                applied_count += 1;
            }
            Err(e) => {
                return ToolCallResult::error(format!("Edit block #{} failed: {e}", i + 1));
            }
        }
    }

    let dry_run = args.dry_run.unwrap_or(false);
    if !dry_run {
        if let Err(e) = fs::write(&resolved, &current_text) {
            return ToolCallResult::error(format!("Failed to save modified file: {e}"));
        }
    }

    let res_json = json!({
        "path": conf.relative_display(&resolved).to_string_lossy(),
        "blocks_applied": applied_count,
        "dry_run": dry_run,
        "status": "success"
    });

    ToolCallResult::success(res_json.to_string())
}

fn apply_single_block(text: &str, search: &str, replace: &str) -> Result<String> {
    let s_clean = strip_line_gutters(search);
    let r_clean = strip_line_gutters(replace);
    let search = s_clean.as_str();
    let replace = r_clean.as_str();

    // If search is empty, append replace to the end of the content
    if search.is_empty() {
        let mut out = text.to_string();
        if !out.ends_with('\n') && !out.is_empty() {
            out.push('\n');
        }
        out.push_str(replace);
        return Ok(out);
    }

    // 1. Exact match check
    let matches: Vec<_> = text.match_indices(search).collect();
    if matches.len() == 1 {
        let idx = matches[0].0;
        let mut out = String::with_capacity(text.len() + replace.len() - search.len());
        out.push_str(&text[..idx]);
        out.push_str(replace);
        out.push_str(&text[idx + search.len()..]);
        return Ok(out);
    } else if matches.len() > 1 {
        bail!(
            "Search block is ambiguous: matched {} times in file",
            matches.len()
        );
    }

    // 2. Whitespace-normalized fuzzy matching
    let norm_search = normalize_whitespace(search);
    let norm_text = normalize_whitespace(text);

    let fuzzy_matches: Vec<_> = norm_text.match_indices(&norm_search).collect();
    if fuzzy_matches.len() == 1 {
        if let Some(res) = line_by_line_fuzzy_replace(text, search, replace) {
            return Ok(res);
        }
    } else if fuzzy_matches.len() > 1 {
        bail!(
            "Fuzzy search block is ambiguous: matched {} times in file",
            fuzzy_matches.len()
        );
    }

    bail!("Search block not found in file. Ensure exact or near-exact lines match.")
}

fn normalize_whitespace(s: &str) -> String {
    s.lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn line_by_line_fuzzy_replace(text: &str, search: &str, replace: &str) -> Option<String> {
    let text_lines: Vec<&str> = text.lines().collect();
    let search_lines: Vec<&str> = search
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect();

    if search_lines.is_empty() {
        return None;
    }

    for start_idx in 0..=text_lines.len().saturating_sub(search_lines.len()) {
        let mut matches = true;
        for (offset, s_line) in search_lines.iter().enumerate() {
            if text_lines[start_idx + offset].trim() != *s_line {
                matches = false;
                break;
            }
        }
        if matches {
            let mut out = Vec::new();
            out.extend_from_slice(&text_lines[..start_idx]);
            out.push(replace);
            out.extend_from_slice(&text_lines[start_idx + search_lines.len()..]);
            return Some(out.join("\n"));
        }
    }

    None
}

pub fn execute_apply_patch(conf: &Confinement, args: ApplyPatchArgs) -> ToolCallResult {
    let resolved = match conf.resolve(&args.path) {
        Ok(p) => p,
        Err(e) => return ToolCallResult::error(e.to_string()),
    };

    if !resolved.exists() {
        return ToolCallResult::error(format!("File '{}' does not exist", args.path));
    }

    let original = match fs::read_to_string(&resolved) {
        Ok(s) => s,
        Err(e) => return ToolCallResult::error(format!("Failed to read file: {e}")),
    };

    let mut search_lines = Vec::new();
    let mut replace_lines = Vec::new();

    for line in args.patch.lines() {
        if line.starts_with("---") || line.starts_with("+++") || line.starts_with("@@") {
            continue;
        }
        if let Some(stripped) = line.strip_prefix('-') {
            search_lines.push(stripped);
        } else if let Some(stripped) = line.strip_prefix('+') {
            replace_lines.push(stripped);
        } else if let Some(stripped) = line.strip_prefix(' ') {
            search_lines.push(stripped);
            replace_lines.push(stripped);
        } else {
            search_lines.push(line);
            replace_lines.push(line);
        }
    }

    let search_block = search_lines.join("\n");
    let replace_block = replace_lines.join("\n");

    match apply_single_block(&original, &search_block, &replace_block) {
        Ok(patched) => {
            if let Err(e) = fs::write(&resolved, &patched) {
                return ToolCallResult::error(format!("Failed to write patched file: {e}"));
            }
            ToolCallResult::success(
                json!({
                    "path": conf.relative_display(&resolved).to_string_lossy(),
                    "status": "success",
                    "patched": true
                })
                .to_string(),
            )
        }
        Err(e) => ToolCallResult::error(format!("Failed to apply patch: {e}")),
    }
}

pub fn execute_copy(conf: &Confinement, args: CopyArgs) -> ToolCallResult {
    let src_str = args.source.as_deref().or(args.from.as_deref());
    let dst_str = args.destination.as_deref().or(args.to.as_deref());

    let (src_p, dst_p) = match (src_str, dst_str) {
        (Some(s), Some(d)) => (s, d),
        _ => return ToolCallResult::error("Must provide 'source' and 'destination' parameters"),
    };

    let src = match conf.resolve(src_p) {
        Ok(p) => p,
        Err(e) => return ToolCallResult::error(format!("Source error: {e}")),
    };
    let dst = match conf.resolve(dst_p) {
        Ok(p) => p,
        Err(e) => return ToolCallResult::error(format!("Destination error: {e}")),
    };

    if !src.exists() {
        return ToolCallResult::error(format!("Source '{}' does not exist", src_p));
    }

    if let Some(parent) = dst.parent() {
        if !parent.exists() {
            let _ = fs::create_dir_all(parent);
        }
    }

    let overwrite = args.overwrite.unwrap_or(false);
    if dst.exists() && !overwrite {
        return ToolCallResult::error(format!(
            "Destination '{}' already exists and overwrite is false",
            dst_p
        ));
    }

    if src.is_dir() {
        if let Err(e) = copy_dir_all(&src, &dst) {
            return ToolCallResult::error(format!("Failed to copy directory: {e}"));
        }
    } else {
        if let Err(e) = fs::copy(&src, &dst) {
            return ToolCallResult::error(format!("Failed to copy file: {e}"));
        }
    }

    let res_json = json!({
        "source": conf.relative_display(&src).to_string_lossy(),
        "destination": conf.relative_display(&dst).to_string_lossy(),
        "status": "success"
    });

    ToolCallResult::success(res_json.to_string())
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dst.join(entry.file_name()))?;
        } else {
            fs::copy(entry.path(), dst.join(entry.file_name()))?;
        }
    }
    Ok(())
}

pub fn execute_move(conf: &Confinement, args: MoveArgs) -> ToolCallResult {
    let src_str = args.source.as_deref().or(args.from.as_deref());
    let dst_str = args.destination.as_deref().or(args.to.as_deref());

    let (src_p, dst_p) = match (src_str, dst_str) {
        (Some(s), Some(d)) => (s, d),
        _ => {
            return ToolCallResult::error(
                "Must provide 'source' (or 'from') and 'destination' (or 'to')",
            )
        }
    };

    let src = match conf.resolve(src_p) {
        Ok(p) => p,
        Err(e) => return ToolCallResult::error(format!("Source error: {e}")),
    };
    let dst = match conf.resolve(dst_p) {
        Ok(p) => p,
        Err(e) => return ToolCallResult::error(format!("Destination error: {e}")),
    };

    if !src.exists() {
        return ToolCallResult::error(format!("Source '{}' does not exist", src_p));
    }

    if let Some(parent) = dst.parent() {
        if !parent.exists() {
            let _ = fs::create_dir_all(parent);
        }
    }

    let overwrite = args.overwrite.unwrap_or(false);
    if dst.exists() && !overwrite {
        return ToolCallResult::error(format!(
            "Destination '{}' already exists and overwrite is false",
            dst_p
        ));
    }

    if let Err(e) = fs::rename(&src, &dst) {
        // Fallback to copy + remove for cross-filesystem moves
        if src.is_dir() {
            if let Err(ce) = copy_dir_all(&src, &dst) {
                return ToolCallResult::error(format!("Move failed: {ce}"));
            }
            let _ = fs::remove_dir_all(&src);
        } else {
            if let Err(ce) = fs::copy(&src, &dst) {
                return ToolCallResult::error(format!("Move failed: {ce} (rename error: {e})"));
            }
            let _ = fs::remove_file(&src);
        }
    }

    let res_json = json!({
        "from": conf.relative_display(&src).to_string_lossy(),
        "to": conf.relative_display(&dst).to_string_lossy(),
        "status": "success"
    });

    ToolCallResult::success(res_json.to_string())
}

pub fn execute_rename(conf: &Confinement, args: RenameArgs) -> ToolCallResult {
    let p_str = match args.path.as_deref().or(args.source.as_deref()) {
        Some(p) => p,
        None => return ToolCallResult::error("Missing 'path' parameter"),
    };

    let src = match conf.resolve(p_str) {
        Ok(p) => p,
        Err(e) => return ToolCallResult::error(e.to_string()),
    };

    if !src.exists() {
        return ToolCallResult::error(format!("Path '{}' does not exist", p_str));
    }

    let clean_new_name = Path::new(&args.new_name)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or(args.new_name);

    let parent = src.parent().unwrap_or(conf.workspace());
    let dst = parent.join(&clean_new_name);

    execute_move(
        conf,
        MoveArgs {
            source: Some(src.to_string_lossy().to_string()),
            from: None,
            destination: Some(dst.to_string_lossy().to_string()),
            to: None,
            overwrite: Some(false),
        },
    )
}

pub fn execute_trash(conf: &Confinement, args: TrashArgs) -> ToolCallResult {
    let resolved = match conf.resolve(&args.path) {
        Ok(p) => p,
        Err(e) => return ToolCallResult::error(e.to_string()),
    };

    if !resolved.exists() {
        return ToolCallResult::error(format!("Path '{}' does not exist", args.path));
    }

    if let Err(e) = trash::delete(&resolved) {
        return ToolCallResult::error(format!("Failed to move '{}' to trash: {e}", args.path));
    }

    let res_json = json!({
        "path": conf.relative_display(&resolved).to_string_lossy(),
        "trashed": true,
        "status": "success"
    });

    ToolCallResult::success(res_json.to_string())
}

pub fn execute_delete(conf: &Confinement, args: DeleteArgs) -> ToolCallResult {
    let resolved = match conf.resolve(&args.path) {
        Ok(p) => p,
        Err(e) => return ToolCallResult::error(e.to_string()),
    };

    if !resolved.exists() {
        return ToolCallResult::error(format!("Path '{}' does not exist", args.path));
    }

    let dry_run = args.dry_run.unwrap_or(false);
    let recursive = args.recursive.unwrap_or(false);

    if resolved.is_dir() && !recursive {
        return ToolCallResult::error(format!(
            "Path '{}' is a directory. Set recursive: true to delete.",
            args.path
        ));
    }

    if !dry_run {
        if resolved.is_dir() {
            if let Err(e) = fs::remove_dir_all(&resolved) {
                return ToolCallResult::error(format!(
                    "Failed to delete directory '{}': {e}",
                    args.path
                ));
            }
        } else {
            if let Err(e) = fs::remove_file(&resolved) {
                return ToolCallResult::error(format!(
                    "Failed to delete file '{}': {e}",
                    args.path
                ));
            }
        }
    }

    let res_json = json!({
        "path": conf.relative_display(&resolved).to_string_lossy(),
        "deleted": true,
        "dry_run": dry_run,
        "status": "success"
    });

    ToolCallResult::success(res_json.to_string())
}

pub fn execute_batch_operations(conf: &Confinement, args: BatchOperationsArgs) -> ToolCallResult {
    let mut results = Vec::new();

    for (idx, op) in args.operations.iter().enumerate() {
        let op_name = op.op.to_lowercase();
        let res = match op_name.as_str() {
            "write" | "write_file" => {
                if let (Some(p), Some(c)) = (&op.path, &op.content) {
                    execute_write_file(
                        conf,
                        WriteFileArgs {
                            path: p.clone(),
                            content: c.clone(),
                            overwrite: Some(true),
                            append: None,
                        },
                    )
                } else {
                    ToolCallResult::error("Missing 'path' or 'content' for write op")
                }
            }
            "create_file" => {
                if let Some(p) = &op.path {
                    execute_create_file(
                        conf,
                        CreateFileArgs {
                            path: p.clone(),
                            content: op.content.clone(),
                            overwrite: Some(true),
                        },
                    )
                } else {
                    ToolCallResult::error("Missing 'path' for create_file op")
                }
            }
            "create_dir" | "create_directory" => {
                if let Some(p) = &op.path {
                    execute_create_directory(conf, CreateDirectoryArgs { path: p.clone() })
                } else {
                    ToolCallResult::error("Missing 'path' for create_dir op")
                }
            }
            "copy" => {
                if let (Some(s), Some(d)) = (&op.source, &op.destination) {
                    execute_copy(
                        conf,
                        CopyArgs {
                            source: Some(s.clone()),
                            from: None,
                            destination: Some(d.clone()),
                            to: None,
                            overwrite: Some(true),
                        },
                    )
                } else {
                    ToolCallResult::error("Missing 'source' or 'destination' for copy op")
                }
            }
            "move" => {
                if let (Some(s), Some(d)) = (&op.source, &op.destination) {
                    execute_move(
                        conf,
                        MoveArgs {
                            source: Some(s.clone()),
                            from: None,
                            destination: Some(d.clone()),
                            to: None,
                            overwrite: Some(true),
                        },
                    )
                } else {
                    ToolCallResult::error("Missing 'source' or 'destination' for move op")
                }
            }
            "delete" => {
                if let Some(p) = &op.path {
                    execute_delete(
                        conf,
                        DeleteArgs {
                            path: p.clone(),
                            recursive: Some(true),
                            dry_run: None,
                        },
                    )
                } else {
                    ToolCallResult::error("Missing 'path' for delete op")
                }
            }
            "append" | "append_file" => {
                if let (Some(p), Some(c)) = (&op.path, &op.content) {
                    execute_append_file(
                        conf,
                        AppendFileArgs {
                            path: p.clone(),
                            content: c.clone(),
                        },
                    )
                } else {
                    ToolCallResult::error("Missing 'path' or 'content' for append op")
                }
            }
            unknown => ToolCallResult::error(format!("Unknown batch operation '{unknown}'")),
        };

        results.push(json!({
            "step": idx + 1,
            "op": op.op,
            "is_error": res.is_error.unwrap_or(false),
            "result": res.content[0].text
        }));
    }

    let all_succeeded = results.iter().all(|r| r["is_error"] == false);
    let res_json = json!({
        "total_operations": results.len(),
        "all_succeeded": all_succeeded,
        "results": results
    });

    ToolCallResult::success(res_json.to_string())
}

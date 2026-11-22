use std::fs;
use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use serde_json::json;
use crate::confinement::Confinement;
use crate::protocol::{ToolCallResult, ToolDefinition};

#[derive(Debug, Serialize, Deserialize)]
pub struct WriteFileArgs {
    pub path: String,
    pub content: String,
    #[serde(default)]
    pub overwrite: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchReplaceBlock {
    pub search: String,
    pub replace: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApplyEditArgs {
    pub path: String,
    pub edits: Vec<SearchReplaceBlock>,
    #[serde(default)]
    pub dry_run: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MoveArgs {
    pub from: String,
    pub to: String,
    #[serde(default)]
    pub overwrite: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TrashArgs {
    pub path: String,
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
                    "overwrite": { "type": "boolean", "description": "Whether to overwrite existing file (default true)" }
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
            name: "apply_edit".into(),
            description: "Apply search/replace edits to a file with whitespace-tolerant fuzzy matching and ambiguity detection.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "File to edit" },
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
                        "description": "List of search/replace blocks"
                    },
                    "dry_run": { "type": "boolean", "description": "Preview modifications without writing to disk" }
                },
                "required": ["path", "edits"]
            }),
            annotations: Some(crate::protocol::ToolAnnotation {
                read_only_hint: Some(false),
                destructive_hint: Some(false),
                idempotent_hint: Some(false),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "move".into(),
            description: "Move or rename a file or directory within the workspace.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "from": { "type": "string", "description": "Source path" },
                    "to": { "type": "string", "description": "Destination path" },
                    "overwrite": { "type": "boolean", "description": "Whether to overwrite destination (default false)" }
                },
                "required": ["from", "to"]
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
    ]
}

pub fn execute_write_file(conf: &Confinement, args: WriteFileArgs) -> ToolCallResult {
    let resolved = match conf.resolve(&args.path) {
        Ok(p) => p,
        Err(e) => return ToolCallResult::error(e.to_string()),
    };

    let overwrite = args.overwrite.unwrap_or(true);
    if resolved.exists() && !overwrite {
        return ToolCallResult::error(format!(
            "File '{}' already exists and overwrite is false",
            args.path
        ));
    }

    if let Some(parent) = resolved.parent() {
        if !parent.exists() {
            if let Err(e) = fs::create_dir_all(parent) {
                return ToolCallResult::error(format!("Failed to create parent directory: {e}"));
            }
        }
    }

    if let Err(e) = fs::write(&resolved, &args.content) {
        return ToolCallResult::error(format!("Failed to write file '{}': {e}", args.path));
    }

    let res_json = json!({
        "path": conf.relative_display(&resolved).to_string_lossy(),
        "bytes_written": args.content.len(),
        "status": "success"
    });

    ToolCallResult::success(res_json.to_string())
}

pub fn execute_apply_edit(conf: &Confinement, args: ApplyEditArgs) -> ToolCallResult {
    let resolved = match conf.resolve(&args.path) {
        Ok(p) => p,
        Err(e) => return ToolCallResult::error(e.to_string()),
    };

    if !resolved.is_file() {
        return ToolCallResult::error(format!("File '{}' does not exist", args.path));
    }

    let original_content = match fs::read_to_string(&resolved) {
        Ok(s) => s,
        Err(e) => return ToolCallResult::error(format!("Failed to read file: {e}")),
    };

    let mut current_content = original_content.clone();
    let mut applied_blocks = 0;

    for (idx, edit) in args.edits.iter().enumerate() {
        match apply_single_block(&current_content, &edit.search, &edit.replace) {
            Ok(new_content) => {
                current_content = new_content;
                applied_blocks += 1;
            }
            Err(e) => {
                return ToolCallResult::error(format!(
                    "Edit block #{} failed in '{}': {e}",
                    idx + 1,
                    args.path
                ));
            }
        }
    }

    let dry_run = args.dry_run.unwrap_or(false);
    if !dry_run {
        if let Err(e) = fs::write(&resolved, &current_content) {
            return ToolCallResult::error(format!("Failed to write modified file: {e}"));
        }
    }

    let res_json = json!({
        "path": conf.relative_display(&resolved).to_string_lossy(),
        "blocks_applied": applied_blocks,
        "dry_run": dry_run,
        "changed": current_content != original_content
    });

    ToolCallResult::success(res_json.to_string())
}

fn apply_single_block(text: &str, search: &str, replace: &str) -> Result<String> {
    if search.is_empty() {
        bail!("Search target cannot be empty");
    }

    // 1. Exact match
    let exact_matches: Vec<_> = text.match_indices(search).collect();
    if exact_matches.len() == 1 {
        let (pos, _) = exact_matches[0];
        let mut out = String::with_capacity(text.len() + replace.len());
        out.push_str(&text[..pos]);
        out.push_str(replace);
        out.push_str(&text[pos + search.len()..]);
        return Ok(out);
    } else if exact_matches.len() > 1 {
        bail!(
            "Ambiguous match: search block matched {} times in file. Provide more context.",
            exact_matches.len()
        );
    }

    // 2. CRLF/LF normalization match
    let norm_text = text.replace("\r\n", "\n");
    let norm_search = search.replace("\r\n", "\n");
    let norm_replace = replace.replace("\r\n", "\n");

    let norm_matches: Vec<_> = norm_text.match_indices(&norm_search).collect();
    if norm_matches.len() == 1 {
        let (pos, _) = norm_matches[0];
        let mut out = String::new();
        out.push_str(&norm_text[..pos]);
        out.push_str(&norm_replace);
        out.push_str(&norm_text[pos + norm_search.len()..]);
        return Ok(out);
    } else if norm_matches.len() > 1 {
        bail!(
            "Ambiguous match after line normalization: search block matched {} times.",
            norm_matches.len()
        );
    }

    // 3. Line-trimmed fuzzy match
    let search_lines: Vec<&str> = norm_search.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect();
    let text_lines: Vec<&str> = norm_text.lines().collect();

    if search_lines.is_empty() {
        bail!("Search block has no non-whitespace lines");
    }

    let mut candidate_positions = Vec::new();
    let n = search_lines.len();

    if text_lines.len() >= n {
        for i in 0..=(text_lines.len() - n) {
            let slice = &text_lines[i..i + n];
            let matches = slice
                .iter()
                .zip(search_lines.iter())
                .all(|(t, s)| t.trim() == *s);

            if matches {
                candidate_positions.push(i);
            }
        }
    }

    if candidate_positions.len() == 1 {
        let line_idx = candidate_positions[0];
        let mut new_lines = Vec::new();
        for (i, line) in text_lines.iter().enumerate() {
            if i == line_idx {
                new_lines.push(norm_replace.as_str());
            } else if i > line_idx && i < line_idx + n {
                // skip replaced lines
            } else {
                new_lines.push(line);
            }
        }
        return Ok(new_lines.join("\n"));
    } else if candidate_positions.len() > 1 {
        bail!(
            "Ambiguous fuzzy match: search pattern matched {} locations.",
            candidate_positions.len()
        );
    }

    bail!("Search block was not found in the file. Check formatting or line ranges.");
}

pub fn execute_move(conf: &Confinement, args: MoveArgs) -> ToolCallResult {
    let src = match conf.resolve(&args.from) {
        Ok(p) => p,
        Err(e) => return ToolCallResult::error(e.to_string()),
    };

    let dst = match conf.resolve(&args.to) {
        Ok(p) => p,
        Err(e) => return ToolCallResult::error(e.to_string()),
    };

    if !src.exists() {
        return ToolCallResult::error(format!("Source '{}' does not exist", args.from));
    }

    let overwrite = args.overwrite.unwrap_or(false);
    if dst.exists() && !overwrite {
        return ToolCallResult::error(format!(
            "Destination '{}' already exists and overwrite is false",
            args.to
        ));
    }

    if let Some(parent) = dst.parent() {
        if !parent.exists() {
            let _ = fs::create_dir_all(parent);
        }
    }

    if let Err(e) = fs::rename(&src, &dst) {
        return ToolCallResult::error(format!("Failed to move from '{}' to '{}': {e}", args.from, args.to));
    }

    let res_json = json!({
        "from": conf.relative_display(&src).to_string_lossy(),
        "to": conf.relative_display(&dst).to_string_lossy(),
        "status": "success"
    });

    ToolCallResult::success(res_json.to_string())
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
        "trashed": true
    });

    ToolCallResult::success(res_json.to_string())
}

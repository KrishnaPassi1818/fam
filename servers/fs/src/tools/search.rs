use crate::confinement::Confinement;
use crate::protocol::{ToolCallResult, ToolDefinition};
use glob::Pattern;
use ignore::WalkBuilder;
use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct GlobArgs {
    pub pattern: String,
    #[serde(default)]
    pub base_dir: Option<String>,
    #[serde(default)]
    pub root: Option<String>,
    #[serde(default)]
    pub path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GrepArgs {
    pub pattern: String,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub case_sensitive: Option<bool>,
    #[serde(default)]
    pub max_matches: Option<usize>,
    #[serde(default)]
    pub context_lines: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SearchFilesArgs {
    #[serde(default)]
    pub path: Option<String>,
    pub pattern: String,
    #[serde(default)]
    pub max_results: Option<usize>,
}

pub fn tool_definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "glob".into(),
            description:
                "Find files matching a glob pattern (e.g. '**/*.rs'), respecting .gitignore.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "pattern": { "type": "string", "description": "Glob pattern to match" },
                    "root": { "type": "string", "description": "Root directory to search in (defaults to workspace)" },
                    "base_dir": { "type": "string", "description": "Base directory to search in (defaults to workspace)" }
                },
                "required": ["pattern"]
            }),
            annotations: Some(crate::protocol::ToolAnnotation {
                read_only_hint: Some(true),
                destructive_hint: Some(false),
                idempotent_hint: Some(true),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "grep".into(),
            description: "Search file contents using regular expressions, respecting .gitignore."
                .into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "pattern": { "type": "string", "description": "Regular expression pattern" },
                    "path": { "type": "string", "description": "File or directory to search in (defaults to workspace)" },
                    "case_sensitive": { "type": "boolean", "description": "Whether regex is case-sensitive (default false)" },
                    "max_matches": { "type": "integer", "description": "Maximum number of matching lines to return (default 100)" },
                    "context_lines": { "type": "integer", "description": "Number of context lines before and after match (default 0)" }
                },
                "required": ["pattern"]
            }),
            annotations: Some(crate::protocol::ToolAnnotation {
                read_only_hint: Some(true),
                destructive_hint: Some(false),
                idempotent_hint: Some(true),
                open_world_hint: Some(false),
            }),
        },
        ToolDefinition {
            name: "search_files".into(),
            description: "Recursively search for files whose names match a pattern or regex across a directory.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Directory to search in (defaults to workspace)" },
                    "pattern": { "type": "string", "description": "Filename pattern or substring to match" },
                    "max_results": { "type": "integer", "description": "Maximum number of results to return (default: 100)" }
                },
                "required": ["pattern"]
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

pub fn execute_glob(conf: &Confinement, args: GlobArgs) -> ToolCallResult {
    let p_opt = args
        .root
        .as_deref()
        .or(args.base_dir.as_deref())
        .or(args.path.as_deref());

    let base = match p_opt {
        Some(p) => match conf.resolve(p) {
            Ok(resolved) => resolved,
            Err(e) => return ToolCallResult::error(e.to_string()),
        },
        None => conf.workspace().to_path_buf(),
    };

    let root_str = conf.workspace().to_string_lossy().to_string();
    let clean = args
        .pattern
        .strip_prefix(&root_str)
        .unwrap_or(&args.pattern);
    let clean_pat = clean.trim_start_matches('/');
    let glob_pat = if clean_pat == "*" { "**/*" } else { clean_pat };

    let pattern = match Pattern::new(glob_pat) {
        Ok(pat) => pat,
        Err(e) => {
            return ToolCallResult::error(format!("Invalid glob pattern '{}': {e}", args.pattern))
        }
    };

    let mut matches = Vec::new();
    let walker = WalkBuilder::new(&base)
        .standard_filters(true)
        .hidden(false)
        .build();

    for result in walker {
        let entry = match result {
            Ok(e) => e,
            Err(_) => continue,
        };

        let path = entry.path();
        if path.is_file() {
            let rel = conf.relative_display(path);
            let rel_str = rel.to_string_lossy();
            let matches_fname = path
                .file_name()
                .map(|n| pattern.matches(&n.to_string_lossy()))
                .unwrap_or(false);
            if pattern.matches(&rel_str) || pattern.matches_path(&rel) || matches_fname {
                matches.push(rel_str.to_string());
            }
        }
    }

    matches.sort();

    let res_json = json!({
        "pattern": args.pattern,
        "base_dir": conf.relative_display(&base).to_string_lossy(),
        "total_matches": matches.len(),
        "matches": matches
    });

    ToolCallResult::success(res_json.to_string())
}

#[derive(Debug, Serialize)]
struct GrepMatch {
    file: String,
    line_number: usize,
    line: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    context_before: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    context_after: Vec<String>,
}

pub fn execute_grep(conf: &Confinement, args: GrepArgs) -> ToolCallResult {
    let target = match &args.path {
        Some(p) => match conf.resolve(p) {
            Ok(resolved) => resolved,
            Err(e) => return ToolCallResult::error(e.to_string()),
        },
        None => conf.workspace().to_path_buf(),
    };

    let case_sensitive = args.case_sensitive.unwrap_or(false);
    let re = match RegexBuilder::new(&args.pattern)
        .case_insensitive(!case_sensitive)
        .build()
    {
        Ok(r) => r,
        Err(e) => return ToolCallResult::error(format!("Invalid regex '{}': {e}", args.pattern)),
    };

    let max_matches = args.max_matches.unwrap_or(100);
    let ctx = args.context_lines.unwrap_or(0);

    let mut matches = Vec::new();
    let mut total_count = 0;
    let mut truncated = false;

    if target.is_file() {
        grep_single_file(
            conf,
            &target,
            &re,
            max_matches,
            ctx,
            &mut matches,
            &mut total_count,
            &mut truncated,
        );
    } else {
        let walker = WalkBuilder::new(&target)
            .standard_filters(true)
            .hidden(false)
            .build();

        for result in walker {
            if truncated {
                break;
            }
            let entry = match result {
                Ok(e) => e,
                Err(_) => continue,
            };
            if entry.path().is_file() {
                grep_single_file(
                    conf,
                    entry.path(),
                    &re,
                    max_matches,
                    ctx,
                    &mut matches,
                    &mut total_count,
                    &mut truncated,
                );
            }
        }
    }

    let res_json = json!({
        "pattern": args.pattern,
        "searched_path": conf.relative_display(&target).to_string_lossy(),
        "total_matches": total_count,
        "returned_matches": matches.len(),
        "truncated": truncated,
        "matches": matches
    });

    ToolCallResult::success(res_json.to_string())
}

#[allow(clippy::too_many_arguments)]
fn grep_single_file(
    conf: &Confinement,
    path: &Path,
    re: &Regex,
    max_matches: usize,
    ctx: usize,
    matches: &mut Vec<GrepMatch>,
    total_count: &mut usize,
    truncated: &mut bool,
) {
    let bytes = match fs::read(path) {
        Ok(b) => b,
        Err(_) => return,
    };

    if bytes.iter().take(8192).any(|&b| b == 0) {
        return; // Skip binary files
    }

    let content = match String::from_utf8(bytes) {
        Ok(s) => s,
        Err(_) => return,
    };

    let lines: Vec<&str> = content.lines().collect();
    let rel_display = conf.relative_display(path).to_string_lossy().to_string();

    for (idx, line) in lines.iter().enumerate() {
        if re.is_match(line) {
            *total_count += 1;
            if matches.len() < max_matches {
                let context_before = if ctx > 0 {
                    let start = idx.saturating_sub(ctx);
                    lines[start..idx].iter().map(|s| s.to_string()).collect()
                } else {
                    Vec::new()
                };

                let context_after = if ctx > 0 {
                    let end = (idx + 1 + ctx).min(lines.len());
                    lines[idx + 1..end].iter().map(|s| s.to_string()).collect()
                } else {
                    Vec::new()
                };

                matches.push(GrepMatch {
                    file: rel_display.clone(),
                    line_number: idx + 1,
                    line: line.to_string(),
                    context_before,
                    context_after,
                });
            } else {
                *truncated = true;
            }
        }
    }
}

pub fn execute_search_files(conf: &Confinement, args: SearchFilesArgs) -> ToolCallResult {
    let base = match &args.path {
        Some(p) => match conf.resolve(p) {
            Ok(p) => p,
            Err(e) => return ToolCallResult::error(e.to_string()),
        },
        None => conf.workspace().to_path_buf(),
    };

    let max_results = args.max_results.unwrap_or(100);
    let pat_lower = args.pattern.to_lowercase();
    let re = RegexBuilder::new(&args.pattern)
        .case_insensitive(true)
        .build()
        .ok();

    let mut matches = Vec::new();
    let walker = WalkBuilder::new(&base)
        .standard_filters(true)
        .hidden(false)
        .build();

    for result in walker {
        if matches.len() >= max_results {
            break;
        }
        let entry = match result {
            Ok(e) => e,
            Err(_) => continue,
        };

        let fname = entry.file_name().to_string_lossy();
        let is_match = fname.to_lowercase().contains(&pat_lower)
            || re.as_ref().map(|r| r.is_match(&fname)).unwrap_or(false);

        if is_match {
            matches.push(json!({
                "name": fname.to_string(),
                "path": conf.relative_display(entry.path()).to_string_lossy().to_string(),
                "is_dir": entry.path().is_dir(),
                "size_bytes": entry.metadata().map(|m| m.len()).unwrap_or(0)
            }));
        }
    }

    let res_json = json!({
        "pattern": args.pattern,
        "base_path": conf.relative_display(&base).to_string_lossy(),
        "total_results": matches.len(),
        "results": matches
    });

    ToolCallResult::success(res_json.to_string())
}

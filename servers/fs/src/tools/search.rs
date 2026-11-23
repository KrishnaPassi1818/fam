use crate::confinement::Confinement;
use crate::protocol::{ToolCallResult, ToolDefinition};
use anyhow::Result;
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
                    "base_dir": { "type": "string", "description": "Base directory to search in (defaults to root)" }
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
                    "path": { "type": "string", "description": "File or directory to search in (defaults to root)" },
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
    ]
}

pub fn execute_glob(conf: &Confinement, args: GlobArgs) -> ToolCallResult {
    let p_opt = args.base_dir.as_deref().or(args.path.as_deref());
    let base = match p_opt {
        Some(p) => match conf.resolve(p) {
            Ok(resolved) => resolved,
            Err(e) => return ToolCallResult::error(e.to_string()),
        },
        None => conf.resolve(".").unwrap_or_else(|_| conf.root().to_path_buf()),
    };

    let pattern = match Pattern::new(&args.pattern) {
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
            if pattern.matches(&rel_str) || pattern.matches_path(rel) {
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
        None => conf.root().to_path_buf(),
    };

    let case_sensitive = args.case_sensitive.unwrap_or(false);
    let re = match RegexBuilder::new(&args.pattern)
        .case_insensitive(!case_sensitive)
        .build()
    {
        Ok(r) => r,
        Err(e) => {
            return ToolCallResult::error(format!("Invalid regex pattern '{}': {e}", args.pattern))
        }
    };

    let max_matches = args.max_matches.unwrap_or(100).max(1);
    let context_lines = args.context_lines.unwrap_or(0);

    let mut matches = Vec::new();
    let mut total_count = 0;
    let mut truncated = false;

    if target.is_file() {
        let _ = grep_file(
            &target,
            &re,
            conf,
            context_lines,
            max_matches,
            &mut matches,
            &mut total_count,
            &mut truncated,
        );
    } else {
        let walker = WalkBuilder::new(&target)
            .standard_filters(true)
            .hidden(false)
            .build();

        for entry in walker {
            let e = match entry {
                Ok(item) => item,
                Err(_) => continue,
            };

            let p = e.path();
            if p.is_file() {
                let _ = grep_file(
                    p,
                    &re,
                    conf,
                    context_lines,
                    max_matches,
                    &mut matches,
                    &mut total_count,
                    &mut truncated,
                );
                if matches.len() >= max_matches {
                    truncated = true;
                    break;
                }
            }
        }
    }

    let res_json = json!({
        "pattern": args.pattern,
        "search_path": conf.relative_display(&target).to_string_lossy(),
        "matches_returned": matches.len(),
        "total_matches": total_count,
        "truncated": truncated,
        "matches": matches
    });

    ToolCallResult::success(res_json.to_string())
}

#[allow(clippy::too_many_arguments)]
fn grep_file(
    path: &Path,
    re: &Regex,
    conf: &Confinement,
    context_lines: usize,
    max_matches: usize,
    matches: &mut Vec<GrepMatch>,
    total_count: &mut usize,
    truncated: &mut bool,
) -> Result<()> {
    let bytes = match fs::read(path) {
        Ok(b) => b,
        Err(_) => return Ok(()),
    };

    // Skip binary files
    if bytes.iter().take(8192).any(|&b| b == 0) {
        return Ok(());
    }

    let content = match std::str::from_utf8(&bytes) {
        Ok(s) => s,
        Err(_) => return Ok(()),
    };

    let lines: Vec<&str> = content.lines().collect();

    for (idx, line) in lines.iter().enumerate() {
        if re.is_match(line) {
            *total_count += 1;

            if matches.len() < max_matches {
                let mut before = Vec::new();
                let start_ctx = idx.saturating_sub(context_lines);
                for ctx_idx in start_ctx..idx {
                    if let Some(l) = lines.get(ctx_idx) {
                        before.push(format!("{}: {}", ctx_idx + 1, l));
                    }
                }

                let mut after = Vec::new();
                for ctx_idx in idx + 1..=(idx + context_lines).min(lines.len().saturating_sub(1)) {
                    if let Some(l) = lines.get(ctx_idx) {
                        after.push(format!("{}: {}", ctx_idx + 1, l));
                    }
                }

                matches.push(GrepMatch {
                    file: conf.relative_display(path).to_string_lossy().to_string(),
                    line_number: idx + 1,
                    line: line.to_string(),
                    context_before: before,
                    context_after: after,
                });
            } else {
                *truncated = true;
            }
        }
    }

    Ok(())
}

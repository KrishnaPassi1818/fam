use crate::confinement::Confinement;
use crate::protocol::{ToolCallResult, ToolDefinition};
use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::path::Path;
use tree_sitter::{Node, Parser};

#[derive(Debug, Serialize, Deserialize)]
pub struct RepoMapArgs {
    #[serde(default)]
    pub root: Option<String>,
    #[serde(default)]
    pub max_symbols: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FindSymbolArgs {
    pub symbol: String,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub max_results: Option<usize>,
}

pub fn tool_definitions() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "repo_map".into(),
            description: "Extract a concise symbol outline (functions, classes, structs, interfaces) from source files using tree-sitter.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "root": { "type": "string", "description": "Root directory to scan (defaults to workspace root)" },
                    "max_symbols": { "type": "integer", "description": "Maximum number of symbols to return (default 200)" }
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
            name: "find_symbol".into(),
            description: "Find symbol definitions (functions, classes, structs, types) matching a name in source files.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "symbol": { "type": "string", "description": "Symbol name or substring to search for" },
                    "path": { "type": "string", "description": "File or directory to search in (defaults to workspace)" },
                    "max_results": { "type": "integer", "description": "Maximum number of results to return (default 100)" }
                },
                "required": ["symbol"]
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

#[derive(Debug, Serialize)]
pub struct FileSymbols {
    pub file: String,
    pub symbols: Vec<String>,
}

pub fn execute_repo_map(conf: &Confinement, args: RepoMapArgs) -> ToolCallResult {
    let target = match &args.root {
        Some(p) => match conf.resolve(p) {
            Ok(resolved) => resolved,
            Err(e) => return ToolCallResult::error(e.to_string()),
        },
        None => conf.workspace().to_path_buf(),
    };

    let max_symbols = args.max_symbols.unwrap_or(200).max(10);
    let mut files_with_symbols = Vec::new();
    let mut total_symbols = 0;
    let mut truncated = false;

    let walker = WalkBuilder::new(&target)
        .standard_filters(true)
        .hidden(true)
        .build();

    for entry in walker {
        let e = match entry {
            Ok(item) => item,
            Err(_) => continue,
        };

        let p = e.path();
        if !p.is_file() {
            continue;
        }

        let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("");
        let symbols = extract_symbols(p, ext);

        if !symbols.is_empty() {
            let rel = conf.relative_display(p).to_string_lossy().to_string();
            let count = symbols.len();

            if total_symbols + count <= max_symbols {
                total_symbols += count;
                files_with_symbols.push(FileSymbols { file: rel, symbols });
            } else {
                let remaining = max_symbols.saturating_sub(total_symbols);
                if remaining > 0 {
                    files_with_symbols.push(FileSymbols {
                        file: rel,
                        symbols: symbols.into_iter().take(remaining).collect(),
                    });
                    total_symbols += remaining;
                }
                truncated = true;
                break;
            }
        }
    }

    let mut markdown_outline = String::new();
    for f in &files_with_symbols {
        markdown_outline.push_str(&format!("### {}\n", f.file));
        for sym in &f.symbols {
            markdown_outline.push_str(&format!("- `{sym}`\n"));
        }
        markdown_outline.push('\n');
    }

    let res_json = json!({
        "root": conf.relative_display(&target).to_string_lossy(),
        "total_files": files_with_symbols.len(),
        "total_symbols": total_symbols,
        "truncated": truncated,
        "outline": markdown_outline.trim_end(),
        "files": files_with_symbols
    });

    ToolCallResult::success(res_json.to_string())
}

pub fn execute_find_symbol(conf: &Confinement, args: FindSymbolArgs) -> ToolCallResult {
    let target = match &args.path {
        Some(p) => match conf.resolve(p) {
            Ok(resolved) => resolved,
            Err(e) => return ToolCallResult::error(e.to_string()),
        },
        None => conf.workspace().to_path_buf(),
    };

    let max_results = args.max_results.unwrap_or(100);
    let sym_query = args.symbol.to_lowercase();
    let mut matches = Vec::new();

    let walker = WalkBuilder::new(&target)
        .standard_filters(true)
        .hidden(true)
        .build();

    for entry in walker {
        if matches.len() >= max_results {
            break;
        }
        let e = match entry {
            Ok(item) => item,
            Err(_) => continue,
        };

        let p = e.path();
        if !p.is_file() {
            continue;
        }

        let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("");
        let symbols = extract_symbols(p, ext);

        for s in symbols {
            if s.to_lowercase().contains(&sym_query) {
                matches.push(json!({
                    "file": conf.relative_display(p).to_string_lossy().to_string(),
                    "symbol": s
                }));
                if matches.len() >= max_results {
                    break;
                }
            }
        }
    }

    let res_json = json!({
        "query": args.symbol,
        "total_matches": matches.len(),
        "matches": matches
    });

    ToolCallResult::success(res_json.to_string())
}

fn extract_symbols(path: &Path, ext: &str) -> Vec<String> {
    let source = match fs::read(path) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };

    let mut parser = Parser::new();
    match ext {
        "rs" => {
            if parser
                .set_language(&tree_sitter_rust::LANGUAGE.into())
                .is_err()
            {
                return Vec::new();
            }
            if let Some(tree) = parser.parse(&source, None) {
                return collect_rust_symbols(tree.root_node(), &source);
            }
        }
        "ts" | "tsx" | "js" | "jsx" => {
            if parser
                .set_language(&tree_sitter_typescript::LANGUAGE_TYPESCRIPT.into())
                .is_err()
            {
                return Vec::new();
            }
            if let Some(tree) = parser.parse(&source, None) {
                return collect_ts_symbols(tree.root_node(), &source);
            }
        }
        "py" => {
            if parser
                .set_language(&tree_sitter_python::LANGUAGE.into())
                .is_err()
            {
                return Vec::new();
            }
            if let Some(tree) = parser.parse(&source, None) {
                return collect_py_symbols(tree.root_node(), &source);
            }
        }
        _ => {}
    }

    Vec::new()
}

fn node_text<'a>(node: Node<'a>, source: &'a [u8]) -> &'a str {
    std::str::from_utf8(&source[node.byte_range()]).unwrap_or("")
}

fn collect_rust_symbols(root: Node, source: &[u8]) -> Vec<String> {
    let mut symbols = Vec::new();
    let mut cursor = root.walk();

    for child in root.children(&mut cursor) {
        match child.kind() {
            "function_item" => {
                if let Some(name_node) = child.child_by_field_name("name") {
                    let name = node_text(name_node, source);
                    symbols.push(format!("fn {name}()"));
                }
            }
            "struct_item" => {
                if let Some(name_node) = child.child_by_field_name("name") {
                    let name = node_text(name_node, source);
                    symbols.push(format!("struct {name}"));
                }
            }
            "enum_item" => {
                if let Some(name_node) = child.child_by_field_name("name") {
                    let name = node_text(name_node, source);
                    symbols.push(format!("enum {name}"));
                }
            }
            "trait_item" => {
                if let Some(name_node) = child.child_by_field_name("name") {
                    let name = node_text(name_node, source);
                    symbols.push(format!("trait {name}"));
                }
            }
            "type_item" => {
                if let Some(name_node) = child.child_by_field_name("name") {
                    let name = node_text(name_node, source);
                    symbols.push(format!("type {name}"));
                }
            }
            "impl_item" => {
                if let Some(type_node) = child.child_by_field_name("type") {
                    let type_name = node_text(type_node, source);
                    if let Some(trait_node) = child.child_by_field_name("trait") {
                        let trait_name = node_text(trait_node, source);
                        symbols.push(format!("impl {trait_name} for {type_name}"));
                    } else {
                        symbols.push(format!("impl {type_name}"));
                    }
                }
            }
            _ => {}
        }
    }

    symbols
}

fn collect_ts_symbols(root: Node, source: &[u8]) -> Vec<String> {
    let mut symbols = Vec::new();
    let mut cursor = root.walk();

    for child in root.children(&mut cursor) {
        let node = if child.kind() == "export_statement" {
            child.child(1).unwrap_or(child)
        } else {
            child
        };

        match node.kind() {
            "function_declaration" => {
                if let Some(name_node) = node.child_by_field_name("name") {
                    let name = node_text(name_node, source);
                    symbols.push(format!("function {name}()"));
                }
            }
            "class_declaration" => {
                if let Some(name_node) = node.child_by_field_name("name") {
                    let name = node_text(name_node, source);
                    symbols.push(format!("class {name}"));
                }
            }
            "interface_declaration" => {
                if let Some(name_node) = node.child_by_field_name("name") {
                    let name = node_text(name_node, source);
                    symbols.push(format!("interface {name}"));
                }
            }
            "type_alias_declaration" => {
                if let Some(name_node) = node.child_by_field_name("name") {
                    let name = node_text(name_node, source);
                    symbols.push(format!("type {name}"));
                }
            }
            _ => {}
        }
    }

    symbols
}

fn collect_py_symbols(root: Node, source: &[u8]) -> Vec<String> {
    let mut symbols = Vec::new();
    let mut cursor = root.walk();

    for child in root.children(&mut cursor) {
        match child.kind() {
            "function_definition" => {
                if let Some(name_node) = child.child_by_field_name("name") {
                    let name = node_text(name_node, source);
                    symbols.push(format!("def {name}()"));
                }
            }
            "class_definition" => {
                if let Some(name_node) = child.child_by_field_name("name") {
                    let name = node_text(name_node, source);
                    symbols.push(format!("class {name}"));
                }
            }
            _ => {}
        }
    }

    symbols
}

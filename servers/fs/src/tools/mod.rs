pub mod edit;
pub mod read;
pub mod repo_map;
pub mod search;

use crate::confinement::Confinement;
use crate::protocol::{ToolCallResult, ToolDefinition};

pub fn all_tool_definitions() -> Vec<ToolDefinition> {
    let mut tools = Vec::new();
    tools.extend(read::tool_definitions());
    tools.extend(search::tool_definitions());
    tools.extend(edit::tool_definitions());
    tools.extend(repo_map::tool_definitions());
    tools
}

pub fn dispatch_tool_call(
    conf: &Confinement,
    name: &str,
    mut args: serde_json::Value,
) -> ToolCallResult {
    normalize_args(&mut args);
    let clean_name = name.strip_prefix("fs_").unwrap_or(name);

    match clean_name {
        // Read & Discovery
        "read_file" | "read" | "cat" => match serde_json::from_value(args) {
            Ok(a) => read::execute_read_file(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for read_file: {e}")),
        },
        "read_file_range" => match serde_json::from_value(args) {
            Ok(a) => read::execute_read_file_range(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for read_file_range: {e}")),
        },
        "list_dir" | "ls" | "list_directory" => match serde_json::from_value(args) {
            Ok(a) => read::execute_list_dir(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for list_dir: {e}")),
        },
        "tree" => match serde_json::from_value(args) {
            Ok(a) => read::execute_tree(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for tree: {e}")),
        },
        "file_info" | "get_file_metadata" | "metadata" | "file_type" | "stat" => match serde_json::from_value(args) {
            Ok(a) => read::execute_file_info(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for file_info: {e}")),
        },
        "exists" => match serde_json::from_value(args) {
            Ok(a) => read::execute_exists(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for exists: {e}")),
        },
        "read_binary" => match serde_json::from_value(args) {
            Ok(a) => read::execute_read_binary(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for read_binary: {e}")),
        },
        "read_multiple" => match serde_json::from_value(args) {
            Ok(a) => read::execute_read_multiple(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for read_multiple: {e}")),
        },
        "compare_files" | "diff_files" | "diff" => match serde_json::from_value(args) {
            Ok(a) => read::execute_compare_files(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for compare_files: {e}")),
        },
        "file_hash" | "read_hash" | "hash" => match serde_json::from_value(args) {
            Ok(a) => read::execute_file_hash(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for file_hash: {e}")),
        },

        // Search
        "glob" => match serde_json::from_value(args) {
            Ok(a) => search::execute_glob(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for glob: {e}")),
        },
        "grep" => match serde_json::from_value(args) {
            Ok(a) => search::execute_grep(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for grep: {e}")),
        },
        "search_files" => match serde_json::from_value(args) {
            Ok(a) => search::execute_search_files(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for search_files: {e}")),
        },

        // Edit & Creation
        "write_file" => match serde_json::from_value(args) {
            Ok(a) => edit::execute_write_file(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for write_file: {e}")),
        },
        "create_file" => match serde_json::from_value(args) {
            Ok(a) => edit::execute_create_file(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for create_file: {e}")),
        },
        "create_directory" | "create_directories" | "create_dir" | "mkdir" => match serde_json::from_value(args) {
            Ok(a) => edit::execute_create_directory(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for create_directory: {e}")),
        },
        "append_file" => match serde_json::from_value(args) {
            Ok(a) => edit::execute_append_file(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for append_file: {e}")),
        },
        "apply_edit" => match serde_json::from_value(args) {
            Ok(a) => edit::execute_apply_edit(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for apply_edit: {e}")),
        },
        "apply_patch" => match serde_json::from_value(args) {
            Ok(a) => edit::execute_apply_patch(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for apply_patch: {e}")),
        },
        "write_binary" => match serde_json::from_value(args) {
            Ok(a) => edit::execute_write_binary(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for write_binary: {e}")),
        },
        "replace_file" => match serde_json::from_value(args) {
            Ok(a) => edit::execute_replace_file(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for replace_file: {e}")),
        },
        "copy" => match serde_json::from_value(args) {
            Ok(a) => edit::execute_copy(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for copy: {e}")),
        },
        "move" => match serde_json::from_value(args) {
            Ok(a) => edit::execute_move(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for move: {e}")),
        },
        "rename" => match serde_json::from_value(args) {
            Ok(a) => edit::execute_rename(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for rename: {e}")),
        },
        "trash" => match serde_json::from_value(args) {
            Ok(a) => edit::execute_trash(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for trash: {e}")),
        },
        "delete" | "delete_file" | "delete_directory" | "remove" | "remove_file" | "remove_dir" => match serde_json::from_value(args) {
            Ok(a) => edit::execute_delete(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for delete: {e}")),
        },
        "batch_operations" => match serde_json::from_value(args) {
            Ok(a) => edit::execute_batch_operations(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for batch_operations: {e}")),
        },

        // Code Intelligence
        "repo_map" => match serde_json::from_value(args) {
            Ok(a) => repo_map::execute_repo_map(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for repo_map: {e}")),
        },
        "find_symbol" => match serde_json::from_value(args) {
            Ok(a) => repo_map::execute_find_symbol(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for find_symbol: {e}")),
        },

        unknown => ToolCallResult::error(format!("Unknown tool '{unknown}'")),
    }
}

fn normalize_args(val: &mut serde_json::Value) {
    if let serde_json::Value::Object(map) = val {
        for (_k, v) in map.iter_mut() {
            if let serde_json::Value::String(s) = v {
                if s == "true" {
                    *v = serde_json::Value::Bool(true);
                } else if s == "false" {
                    *v = serde_json::Value::Bool(false);
                } else if let Ok(num) = s.parse::<i64>() {
                    *v = serde_json::Value::Number(num.into());
                }
            } else if v.is_object() || v.is_array() {
                normalize_args(v);
            }
        }
    } else if let serde_json::Value::Array(arr) = val {
        for item in arr.iter_mut() {
            normalize_args(item);
        }
    }
}

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
    match name {
        "read_file" => match serde_json::from_value(args) {
            Ok(a) => read::execute_read_file(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for read_file: {e}")),
        },
        "list_dir" => match serde_json::from_value(args) {
            Ok(a) => read::execute_list_dir(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for list_dir: {e}")),
        },
        "file_info" => match serde_json::from_value(args) {
            Ok(a) => read::execute_file_info(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for file_info: {e}")),
        },
        "file_hash" | "read_hash" | "hash" => match serde_json::from_value(args) {
            Ok(a) => read::execute_file_hash(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for file_hash: {e}")),
        },
        "glob" => match serde_json::from_value(args) {
            Ok(a) => search::execute_glob(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for glob: {e}")),
        },
        "grep" => match serde_json::from_value(args) {
            Ok(a) => search::execute_grep(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for grep: {e}")),
        },
        "write_file" => match serde_json::from_value(args) {
            Ok(a) => edit::execute_write_file(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for write_file: {e}")),
        },
        "apply_edit" => match serde_json::from_value(args) {
            Ok(a) => edit::execute_apply_edit(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for apply_edit: {e}")),
        },
        "move" => match serde_json::from_value(args) {
            Ok(a) => edit::execute_move(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for move: {e}")),
        },
        "trash" => match serde_json::from_value(args) {
            Ok(a) => edit::execute_trash(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for trash: {e}")),
        },
        "repo_map" => match serde_json::from_value(args) {
            Ok(a) => repo_map::execute_repo_map(conf, a),
            Err(e) => ToolCallResult::error(format!("Invalid arguments for repo_map: {e}")),
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

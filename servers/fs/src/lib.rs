pub mod confinement;
pub mod protocol;
pub mod server;
pub mod tools;

pub use confinement::Confinement;
pub use server::FsServer;

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn test_read_file_line_ranges() {
        let tmp = tempdir().unwrap();
        let file = tmp.path().join("sample.txt");
        fs::write(&file, "Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n").unwrap();

        let conf = Confinement::new(tmp.path()).unwrap();
        let res = tools::read::execute_read_file(
            &conf,
            tools::read::ReadFileArgs {
                path: "sample.txt".into(),
                start_line: Some(2),
                end_line: Some(4),
            },
        );

        assert_eq!(res.is_error, Some(false));
        let val: serde_json::Value = serde_json::from_str(&res.content[0].text).unwrap();
        assert_eq!(val["start_line"], 2);
        assert_eq!(val["end_line"], 4);
        assert_eq!(val["total_lines"], 5);
        assert_eq!(val["lines_returned"], 3);
        assert_eq!(val["truncated"], true);
        assert!(val["content"].as_str().unwrap().contains("Line 2"));
        assert!(val["content"].as_str().unwrap().contains("Line 4"));
        assert!(!val["content"].as_str().unwrap().contains("Line 1"));
    }

    #[test]
    fn test_write_and_file_info() {
        let tmp = tempdir().unwrap();
        let conf = Confinement::new(tmp.path()).unwrap();

        let write_res = tools::edit::execute_write_file(
            &conf,
            tools::edit::WriteFileArgs {
                path: "nested/dir/hello.txt".into(),
                content: "Hello World!\nSecond Line".into(),
                overwrite: Some(true),
            },
        );
        assert_eq!(write_res.is_error, Some(false));

        let info_res = tools::read::execute_file_info(
            &conf,
            tools::read::FileInfoArgs {
                path: "nested/dir/hello.txt".into(),
            },
        );
        assert_eq!(info_res.is_error, Some(false));
        let info_val: serde_json::Value = serde_json::from_str(&info_res.content[0].text).unwrap();
        assert_eq!(info_val["is_file"], true);
        assert_eq!(info_val["line_count"], 2);
        assert_eq!(info_val["size_bytes"], 24);
    }

    #[test]
    fn test_glob_and_grep() {
        let tmp = tempdir().unwrap();
        let conf = Confinement::new(tmp.path()).unwrap();

        fs::write(
            tmp.path().join("a.rs"),
            "fn foo() { println!(\"TODO: bar\"); }",
        )
        .unwrap();
        fs::write(tmp.path().join("b.txt"), "regular note").unwrap();

        let glob_res = tools::search::execute_glob(
            &conf,
            tools::search::GlobArgs {
                pattern: "*.rs".into(),
                base_dir: None,
                path: None,
            },
        );
        assert_eq!(glob_res.is_error, Some(false));
        let glob_val: serde_json::Value = serde_json::from_str(&glob_res.content[0].text).unwrap();
        assert_eq!(glob_val["total_matches"], 1);

        let grep_res = tools::search::execute_grep(
            &conf,
            tools::search::GrepArgs {
                pattern: "TODO.*".into(),
                path: None,
                case_sensitive: Some(false),
                max_matches: Some(10),
                context_lines: Some(0),
            },
        );
        assert_eq!(grep_res.is_error, Some(false));
        let grep_val: serde_json::Value = serde_json::from_str(&grep_res.content[0].text).unwrap();
        assert_eq!(grep_val["total_matches"], 1);
        assert!(grep_val["matches"][0]["line"]
            .as_str()
            .unwrap()
            .contains("TODO: bar"));
    }

    #[test]
    fn test_apply_edit_fuzzy_and_ambiguity() {
        let tmp = tempdir().unwrap();
        let conf = Confinement::new(tmp.path()).unwrap();
        let file = tmp.path().join("code.ts");

        fs::write(&file, "function greet() {\n    return 'hi';\n}\n").unwrap();

        // Exact match
        let edit_res = tools::edit::execute_apply_edit(
            &conf,
            tools::edit::ApplyEditArgs {
                path: "code.ts".into(),
                edits: vec![tools::edit::SearchReplaceBlock {
                    search: "return 'hi';".into(),
                    replace: "return 'hello world';".into(),
                }],
                dry_run: Some(false),
            },
        );
        assert_eq!(edit_res.is_error, Some(false));

        let updated = fs::read_to_string(&file).unwrap();
        assert!(updated.contains("return 'hello world';"));

        // Ambiguity check: duplicate line
        fs::write(&file, "foo\nfoo\nbar\n").unwrap();
        let ambig_res = tools::edit::execute_apply_edit(
            &conf,
            tools::edit::ApplyEditArgs {
                path: "code.ts".into(),
                edits: vec![tools::edit::SearchReplaceBlock {
                    search: "foo".into(),
                    replace: "baz".into(),
                }],
                dry_run: Some(false),
            },
        );
        assert_eq!(ambig_res.is_error, Some(true));
        assert!(ambig_res.content[0].text.contains("Ambiguous match"));
    }

    #[test]
    fn test_mcp_protocol_server_dispatch() {
        let tmp = tempdir().unwrap();
        let conf = Confinement::new(tmp.path()).unwrap();
        let server = FsServer::new(conf);

        // initialize
        let init_resp = server.handle_request("initialize", None, json!(1));
        assert!(init_resp.error.is_none());
        assert_eq!(init_resp.result.unwrap()["serverInfo"]["name"], "fam-fs");

        // tools/list
        let list_resp = server.handle_request("tools/list", None, json!(2));
        assert!(list_resp.error.is_none());
        let tools = list_resp.result.unwrap()["tools"]
            .as_array()
            .unwrap()
            .clone();
        assert!(tools.len() >= 9);

        // tools/call: write_file
        let call_resp = server.handle_request(
            "tools/call",
            Some(json!({
                "name": "write_file",
                "arguments": {
                    "path": "test.txt",
                    "content": "mcp hello"
                }
            })),
            json!(3),
        );
        assert!(call_resp.error.is_none());
        let call_res = call_resp.result.unwrap();
        assert_eq!(call_res["isError"], false);
    }

    #[test]
    fn test_repo_map_extracts_symbols() {
        let tmp = tempdir().unwrap();
        let conf = Confinement::new(tmp.path()).unwrap();

        fs::write(
            tmp.path().join("service.rs"),
            "pub struct Database;\nimpl Database {\n    pub fn connect() {}\n}\npub fn start_server() {}\n",
        )
        .unwrap();

        fs::write(
            tmp.path().join("index.ts"),
            "export interface User {\n    id: string;\n}\nexport function getUser(): User {\n    return { id: '1' };\n}\n",
        )
        .unwrap();

        let map_res = tools::repo_map::execute_repo_map(
            &conf,
            tools::repo_map::RepoMapArgs {
                root: None,
                max_symbols: Some(50),
            },
        );
        assert_eq!(map_res.is_error, Some(false));
        let val: serde_json::Value = serde_json::from_str(&map_res.content[0].text).unwrap();
        assert!(val["total_symbols"].as_u64().unwrap() >= 3);
        let outline = val["outline"].as_str().unwrap();
        assert!(outline.contains("struct Database"));
        assert!(outline.contains("fn start_server()"));
        assert!(outline.contains("interface User"));
        assert!(outline.contains("function getUser()"));
    }
}

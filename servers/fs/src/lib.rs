pub mod confinement;
pub mod protocol;
pub mod server;
pub mod tools;

pub use confinement::Confinement;
pub use server::FsServer;

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;
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
                raw: None,
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

        // Raw read test
        let raw_res = tools::read::execute_read_file(
            &conf,
            tools::read::ReadFileArgs {
                path: "sample.txt".into(),
                start_line: Some(2),
                end_line: Some(3),
                raw: Some(true),
            },
        );
        assert_eq!(raw_res.is_error, Some(false));
        let raw_val: serde_json::Value = serde_json::from_str(&raw_res.content[0].text).unwrap();
        assert_eq!(raw_val["content"], "Line 2\nLine 3\n");
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
                append: None,
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

        // Test writing content with line gutters automatically strips gutters
        let write_gutters = tools::edit::execute_write_file(
            &conf,
            tools::edit::WriteFileArgs {
                path: "gutter_test.txt".into(),
                content: "   1 | Alpha\n   2 | Beta\n   3 | \n   4 | Gamma".into(),
                overwrite: Some(true),
                append: None,
            },
        );
        assert_eq!(write_gutters.is_error, Some(false));
        let read_clean = tools::read::execute_read_file(
            &conf,
            tools::read::ReadFileArgs {
                path: "gutter_test.txt".into(),
                start_line: None,
                end_line: None,
                raw: Some(true),
            },
        );
        let read_val: serde_json::Value =
            serde_json::from_str(&read_clean.content[0].text).unwrap();
        assert_eq!(read_val["content"], "Alpha\nBeta\n\nGamma\n");
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
                root: None,
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
                edits: Some(vec![tools::edit::SearchReplaceBlock {
                    search: "return 'hi';".into(),
                    replace: "return 'hello world';".into(),
                }]),
                search: None,
                replace: None,
                dry_run: Some(false),
            },
        );
        assert_eq!(edit_res.is_error, Some(false));

        let updated = fs::read_to_string(&file).unwrap();
        assert!(updated.contains("return 'hello world';"));

        // Append to end of file when search is empty
        let append_res = tools::edit::execute_apply_edit(
            &conf,
            tools::edit::ApplyEditArgs {
                path: "code.ts".into(),
                edits: Some(vec![tools::edit::SearchReplaceBlock {
                    search: "".into(),
                    replace: "// Appended line".into(),
                }]),
                search: None,
                replace: None,
                dry_run: Some(false),
            },
        );
        assert_eq!(append_res.is_error, Some(false));
        let appended = fs::read_to_string(&file).unwrap();
        assert!(appended.ends_with("// Appended line"));

        // Ambiguity check: duplicate line
        fs::write(&file, "foo\nfoo\nbar\n").unwrap();
        let ambig_res = tools::edit::execute_apply_edit(
            &conf,
            tools::edit::ApplyEditArgs {
                path: "code.ts".into(),
                edits: Some(vec![tools::edit::SearchReplaceBlock {
                    search: "foo".into(),
                    replace: "baz".into(),
                }]),
                search: None,
                replace: None,
                dry_run: Some(false),
            },
        );
        assert_eq!(ambig_res.is_error, Some(true));
        assert!(ambig_res.content[0].text.contains("ambiguous"));
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
        assert!(tools.len() >= 18);

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
    fn test_repo_map_and_find_symbol() {
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

        // Find symbol
        let find_res = tools::repo_map::execute_find_symbol(
            &conf,
            tools::repo_map::FindSymbolArgs {
                symbol: "start_server".into(),
                path: None,
                max_results: None,
            },
        );
        assert_eq!(find_res.is_error, Some(false));
        let find_val: serde_json::Value = serde_json::from_str(&find_res.content[0].text).unwrap();
        assert_eq!(find_val["total_matches"], 1);
    }

    #[test]
    fn test_new_filesystem_tools() {
        let tmp = tempdir().unwrap();
        let conf = Confinement::new(tmp.path()).unwrap();

        // 1. create_directory
        let dir_res = tools::edit::execute_create_directory(
            &conf,
            tools::edit::CreateDirectoryArgs {
                path: "my_folder/sub_folder".into(),
            },
        );
        assert_eq!(dir_res.is_error, Some(false));
        assert!(tmp.path().join("my_folder/sub_folder").is_dir());

        // 2. create_file
        let cf_res = tools::edit::execute_create_file(
            &conf,
            tools::edit::CreateFileArgs {
                path: "my_folder/sub_folder/app.py".into(),
                content: Some("print('hello')\n".into()),
                overwrite: Some(true),
            },
        );
        assert_eq!(cf_res.is_error, Some(false));
        assert!(tmp.path().join("my_folder/sub_folder/app.py").exists());

        // 3. exists
        let ex_res = tools::read::execute_exists(
            &conf,
            tools::read::ExistsArgs {
                path: "my_folder/sub_folder/app.py".into(),
            },
        );
        let ex_val: serde_json::Value = serde_json::from_str(&ex_res.content[0].text).unwrap();
        assert_eq!(ex_val["exists"], true);
        assert_eq!(ex_val["is_file"], true);

        // 4. copy
        let cp_res = tools::edit::execute_copy(
            &conf,
            tools::edit::CopyArgs {
                source: Some("my_folder/sub_folder/app.py".into()),
                from: None,
                destination: Some("my_folder/sub_folder/app_copy.py".into()),
                to: None,
                overwrite: Some(true),
            },
        );
        assert_eq!(cp_res.is_error, Some(false));
        assert!(tmp.path().join("my_folder/sub_folder/app_copy.py").exists());

        // 5. compare_files
        let comp_res = tools::read::execute_compare_files(
            &conf,
            tools::read::CompareFilesArgs {
                path_a: "my_folder/sub_folder/app.py".into(),
                path_b: "my_folder/sub_folder/app_copy.py".into(),
            },
        );
        let comp_val: serde_json::Value = serde_json::from_str(&comp_res.content[0].text).unwrap();
        assert_eq!(comp_val["identical"], true);

        // 6. tree
        let tree_res = tools::read::execute_tree(
            &conf,
            tools::read::TreeArgs {
                path: None,
                depth: Some(3),
                max_entries: None,
            },
        );
        assert_eq!(tree_res.is_error, Some(false));
        let tree_val: serde_json::Value = serde_json::from_str(&tree_res.content[0].text).unwrap();
        assert!(tree_val["tree"].as_str().unwrap().contains("my_folder"));

        // 7. binary read & write
        let bin_bytes = vec![0u8, 159, 255, 12, 0, 88];
        let base64_str = base64::prelude::BASE64_STANDARD.encode(&bin_bytes);
        let wb_res = tools::edit::execute_write_binary(
            &conf,
            tools::edit::WriteBinaryArgs {
                path: "data.bin".into(),
                content_base64: base64_str.clone(),
                overwrite: Some(true),
            },
        );
        assert_eq!(wb_res.is_error, Some(false));

        let rb_res = tools::read::execute_read_binary(
            &conf,
            tools::read::ReadBinaryArgs {
                path: "data.bin".into(),
            },
        );
        assert_eq!(rb_res.is_error, Some(false));
        let rb_val: serde_json::Value = serde_json::from_str(&rb_res.content[0].text).unwrap();
        assert_eq!(rb_val["content_base64"], base64_str);
        assert_eq!(rb_val["size_bytes"], bin_bytes.len());

        // 8. delete with dry-run and actual delete
        let del_dry = tools::edit::execute_delete(
            &conf,
            tools::edit::DeleteArgs {
                path: "data.bin".into(),
                recursive: None,
                dry_run: Some(true),
            },
        );
        assert_eq!(del_dry.is_error, Some(false));
        assert!(tmp.path().join("data.bin").exists());

        let del_act = tools::edit::execute_delete(
            &conf,
            tools::edit::DeleteArgs {
                path: "data.bin".into(),
                recursive: None,
                dry_run: Some(false),
            },
        );
        assert_eq!(del_act.is_error, Some(false));
        assert!(!tmp.path().join("data.bin").exists());
    }
}

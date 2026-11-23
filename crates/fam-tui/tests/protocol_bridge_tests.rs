use fam_tui::protocol::{FromTuiMessage, ToTuiMessage};

#[test]
fn test_rust_deserializes_all_backend_messages() {
    let json_samples = vec![
        r#"{"type":"init","model":"llama3.1:8b","max_ctx":8192,"tier":"medium","is_local":true,"cwd":"/workspace","role":"assistant"}"#,
        r#"{"type":"message","id":"m1","role":"user","content":"hello world","model":null}"#,
        r#"{"type":"chunk","delta":"streaming chunk text","tokens_per_sec":42.5}"#,
        r#"{"type":"tool_call","id":"call_1","name":"fs_read","args":{"path":"test.txt"}}"#,
        r#"{"type":"tool_result","call_id":"call_1","is_error":false,"content":"ok","duration_ms":35}"#,
        r#"{"type":"status","used_tokens":1234,"tokens_per_sec":30.0,"model":"qwen","max_ctx":4096,"tier":"min","is_local":true,"cwd":"/home"}"#,
        r#"{"type":"warning","message":"caution: memory limit approaching"}"#,
        r#"{"type":"approval_request","id":"req_9","tool_name":"rm","args":{"file":"/tmp/a"},"tier":3,"reason":"Deleting file"}"#,
        r#"{"type":"finish","response":"Finished processing","total_tokens":2500}"#,
        r#"{"type":"error","message":"Model timeout"}"#,
        r#"{"type":"clear"}"#,
        r#"{"type":"exit"}"#,
    ];

    for (i, json) in json_samples.iter().enumerate() {
        let parsed: Result<ToTuiMessage, _> = serde_json::from_str(json);
        assert!(
            parsed.is_ok(),
            "Sample {} failed to deserialize: {}\nError: {:?}",
            i,
            json,
            parsed.err()
        );
    }
}

#[test]
fn test_rust_serializes_all_frontend_messages() {
    let msgs = vec![
        FromTuiMessage::UserInput {
            text: "Hello from user".to_string(),
        },
        FromTuiMessage::ApprovalDecision {
            request_id: "req_1".to_string(),
            decision: "allow_once".to_string(),
            edited_args: None,
        },
        FromTuiMessage::ApprovalDecision {
            request_id: "req_2".to_string(),
            decision: "edit_args".to_string(),
            edited_args: Some(serde_json::json!({ "safe_arg": true })),
        },
        FromTuiMessage::Interrupt,
        FromTuiMessage::Exit,
    ];

    for msg in msgs {
        let serialized = serde_json::to_string(&msg).expect("Failed to serialize FromTuiMessage");
        assert!(!serialized.is_empty());
        let round_trip: FromTuiMessage =
            serde_json::from_str(&serialized).expect("Failed to round-trip FromTuiMessage");
        assert_eq!(msg, round_trip);
    }
}

#[test]
fn test_rust_deserialization_handles_unicode_and_escapes() {
    let json = r#"{"type":"message","id":"unicode_1","role":"assistant","content":"Special ⚙ ✖ ▌ \n \t \"quotes\" and emojis 🎉","model":"llama3.1:8b"}"#;
    let parsed: ToTuiMessage = serde_json::from_str(json).unwrap();
    match parsed {
        ToTuiMessage::Message { content, .. } => {
            assert!(content.contains("⚙"));
            assert!(content.contains("🎉"));
            assert!(content.contains("\"quotes\""));
        }
        _ => panic!("Expected Message variant"),
    }
}

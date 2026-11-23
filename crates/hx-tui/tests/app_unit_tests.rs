use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use hx_tui::{
    app::{App, StatusInfo},
    protocol::{FromTuiMessage, ToTuiMessage},
    ui,
};
use ratatui::{backend::TestBackend, Terminal};

#[test]
fn test_app_input_editing_comprehensive() {
    let mut app = App::new();

    // Type "hello"
    for c in "hello".chars() {
        app.handle_key(KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE));
    }
    assert_eq!(app.input, "hello");
    assert_eq!(app.input_cursor, 5);

    // Left arrow twice
    app.handle_key(KeyEvent::new(KeyCode::Left, KeyModifiers::NONE));
    app.handle_key(KeyEvent::new(KeyCode::Left, KeyModifiers::NONE));
    assert_eq!(app.input_cursor, 3);

    // Insert 'X'
    app.handle_key(KeyEvent::new(KeyCode::Char('X'), KeyModifiers::NONE));
    assert_eq!(app.input, "helXlo");
    assert_eq!(app.input_cursor, 4);

    // Home
    app.handle_key(KeyEvent::new(KeyCode::Home, KeyModifiers::NONE));
    assert_eq!(app.input_cursor, 0);

    // Delete at index 0 (removes 'h')
    app.handle_key(KeyEvent::new(KeyCode::Delete, KeyModifiers::NONE));
    assert_eq!(app.input, "elXlo");

    // End
    app.handle_key(KeyEvent::new(KeyCode::End, KeyModifiers::NONE));
    assert_eq!(app.input_cursor, 5);

    // Right arrow at end should stay at 5
    app.handle_key(KeyEvent::new(KeyCode::Right, KeyModifiers::NONE));
    assert_eq!(app.input_cursor, 5);
}

#[test]
fn test_app_history_navigation() {
    let mut app = App::new();

    // Submit "cmd1"
    for c in "cmd1".chars() {
        app.handle_key(KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE));
    }
    app.handle_key(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE));

    // Submit "cmd2"
    for c in "cmd2".chars() {
        app.handle_key(KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE));
    }
    app.handle_key(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE));

    assert_eq!(app.input_history, vec!["cmd1", "cmd2"]);

    // Up arrow should recall "cmd2"
    app.handle_key(KeyEvent::new(KeyCode::Up, KeyModifiers::NONE));
    assert_eq!(app.input, "cmd2");

    // Up arrow again should recall "cmd1"
    app.handle_key(KeyEvent::new(KeyCode::Up, KeyModifiers::NONE));
    assert_eq!(app.input, "cmd1");

    // Up arrow at top stays at "cmd1"
    app.handle_key(KeyEvent::new(KeyCode::Up, KeyModifiers::NONE));
    assert_eq!(app.input, "cmd1");

    // Down arrow returns to "cmd2"
    app.handle_key(KeyEvent::new(KeyCode::Down, KeyModifiers::NONE));
    assert_eq!(app.input, "cmd2");

    // Down arrow past end clears input
    app.handle_key(KeyEvent::new(KeyCode::Down, KeyModifiers::NONE));
    assert_eq!(app.input, "");
}

#[test]
fn test_app_scroll_behavior() {
    let mut app = App::new();
    assert!(app.auto_scroll);
    assert_eq!(app.scroll_offset, 0);

    // PageUp increases offset and disables auto_scroll
    app.handle_key(KeyEvent::new(KeyCode::PageUp, KeyModifiers::NONE));
    assert_eq!(app.scroll_offset, 5);
    assert!(!app.auto_scroll);

    // PageUp again
    app.handle_key(KeyEvent::new(KeyCode::PageUp, KeyModifiers::NONE));
    assert_eq!(app.scroll_offset, 10);

    // PageDown decreases offset
    app.handle_key(KeyEvent::new(KeyCode::PageDown, KeyModifiers::NONE));
    assert_eq!(app.scroll_offset, 5);
    assert!(!app.auto_scroll);

    // PageDown to 0 re-enables auto_scroll
    app.handle_key(KeyEvent::new(KeyCode::PageDown, KeyModifiers::NONE));
    assert_eq!(app.scroll_offset, 0);
    assert!(app.auto_scroll);
}

#[test]
fn test_app_spinner_and_ticks() {
    let mut app = App::new();
    let initial_spin = app.spinner_char();
    assert!(!initial_spin.is_empty());

    for _ in 0..10 {
        app.tick();
    }
    // After 10 ticks, it wraps around properly
    assert_eq!(app.spinner_char(), initial_spin);
}

#[test]
fn test_approval_modal_all_keys() {
    let mut app = App::new();

    // 1. Test allow_session ('a')
    app.apply_backend_message(ToTuiMessage::ApprovalRequest {
        id: "req_a".to_string(),
        tool_name: "fs_write".to_string(),
        args: serde_json::json!({ "path": "file.txt" }),
        tier: 1,
        reason: None,
    });
    let dec_a = app.handle_key(KeyEvent::new(KeyCode::Char('a'), KeyModifiers::NONE));
    assert_eq!(
        dec_a,
        Some(FromTuiMessage::ApprovalDecision {
            request_id: "req_a".to_string(),
            decision: "allow_session".to_string(),
            edited_args: None,
        })
    );

    // 2. Test deny ('n')
    app.apply_backend_message(ToTuiMessage::ApprovalRequest {
        id: "req_n".to_string(),
        tool_name: "fs_write".to_string(),
        args: serde_json::json!({ "path": "file.txt" }),
        tier: 2,
        reason: None,
    });
    let dec_n = app.handle_key(KeyEvent::new(KeyCode::Char('n'), KeyModifiers::NONE));
    assert_eq!(
        dec_n,
        Some(FromTuiMessage::ApprovalDecision {
            request_id: "req_n".to_string(),
            decision: "deny".to_string(),
            edited_args: None,
        })
    );

    // 3. Test edit_args ('e')
    app.apply_backend_message(ToTuiMessage::ApprovalRequest {
        id: "req_e".to_string(),
        tool_name: "cmd_run".to_string(),
        args: serde_json::json!({ "command": "ls" }),
        tier: 3,
        reason: None,
    });
    let dec_e = app.handle_key(KeyEvent::new(KeyCode::Char('e'), KeyModifiers::NONE));
    assert_eq!(
        dec_e,
        Some(FromTuiMessage::ApprovalDecision {
            request_id: "req_e".to_string(),
            decision: "edit_args".to_string(),
            edited_args: Some(serde_json::json!({ "command": "ls" })),
        })
    );

    // 4. Test toggle details ('?')
    app.apply_backend_message(ToTuiMessage::ApprovalRequest {
        id: "req_q".to_string(),
        tool_name: "cmd_run".to_string(),
        args: serde_json::json!({}),
        tier: 2,
        reason: None,
    });
    assert!(!app.approval_modal.as_ref().unwrap().show_details);
    app.handle_key(KeyEvent::new(KeyCode::Char('?'), KeyModifiers::NONE));
    assert!(app.approval_modal.as_ref().unwrap().show_details);
    app.handle_key(KeyEvent::new(KeyCode::Char('?'), KeyModifiers::NONE));
    assert!(!app.approval_modal.as_ref().unwrap().show_details);
}

#[test]
fn test_status_bar_cloud_rendering() {
    let backend = TestBackend::new(80, 24);
    let mut terminal = Terminal::new(backend).unwrap();

    let mut app = App::new();
    app.status = StatusInfo {
        model: "gemini-2.5-flash".to_string(),
        used_tokens: 1500,
        max_ctx: 1000000,
        tier: "full".to_string(),
        is_local: false,
        cwd: "/tmp".to_string(),
        tokens_per_sec: None,
        role: "assistant".to_string(),
    };

    terminal.draw(|f| ui::render_app(f, &app)).unwrap();
    let view = terminal.backend().to_string();

    assert!(view.contains("gemini-2.5-flash"));
    assert!(view.contains("CLOUD"));
    assert!(view.contains("full"));
}

#[test]
fn test_tool_call_truncation_rendering() {
    let backend = TestBackend::new(120, 24);
    let mut terminal = Terminal::new(backend).unwrap();

    let mut app = App::new();
    let long_result = "A".repeat(100);

    app.apply_backend_message(ToTuiMessage::ToolCall {
        id: "c1".to_string(),
        name: "test_tool".to_string(),
        args: serde_json::json!({ "k": "v" }),
    });
    app.apply_backend_message(ToTuiMessage::ToolResult {
        call_id: "c1".to_string(),
        is_error: false,
        content: long_result,
        duration_ms: Some(12),
    });

    terminal.draw(|f| ui::render_app(f, &app)).unwrap();
    let view = terminal.backend().to_string();

    assert!(view.contains("test_tool"));
    assert!(view.contains("...")); // verifies truncation
}

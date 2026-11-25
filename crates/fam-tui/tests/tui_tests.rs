use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};
use fam_tui::{
    app::{App, StatusInfo},
    protocol::{FromTuiMessage, ToTuiMessage},
    ui,
};
use ratatui::{backend::TestBackend, Terminal};

#[test]
fn test_status_bar_rendering() {
    let backend = TestBackend::new(80, 24);
    let mut terminal = Terminal::new(backend).unwrap();

    let mut app = App::new();
    app.status = StatusInfo {
        model: "qwen3.5:4b".to_string(),
        used_tokens: 2400,
        max_ctx: 4096,
        tier: "medium".to_string(),
        is_local: true,
        cwd: "/home/user/project".to_string(),
        tokens_per_sec: Some(35.5),
        role: "assistant".to_string(),
    };

    terminal.draw(|f| ui::render_app(f, &app)).unwrap();
    let view = terminal.backend().to_string();

    assert!(view.contains("qwen3.5:4b"), "Expected model in status bar");
    assert!(view.contains("ctx 2.4k/4k"), "Expected ctx in status bar");
    assert!(view.contains("medium"), "Expected tier in status bar");
    assert!(view.contains("35.5 tok/s"), "Expected tok/s in status bar");
    assert!(view.contains("LOCAL"), "Expected LOCAL badge in status bar");
    assert!(
        view.contains("/home/user/project"),
        "Expected cwd in status bar"
    );
}

#[test]
fn test_messages_rendering_and_streaming() {
    let backend = TestBackend::new(80, 24);
    let mut terminal = Terminal::new(backend).unwrap();

    let mut app = App::new();
    app.apply_backend_message(ToTuiMessage::Message {
        id: "m1".to_string(),
        role: "user".to_string(),
        content: "How do I build fam?".to_string(),
        model: None,
    });
    app.apply_backend_message(ToTuiMessage::Chunk {
        delta: "Run cargo build and pnpm build".to_string(),
        tokens_per_sec: Some(40.0),
    });

    terminal.draw(|f| ui::render_app(f, &app)).unwrap();
    let view = terminal.backend().to_string();

    assert!(
        view.contains("User > How do I build fam?"),
        "Expected user message"
    );
    assert!(
        view.contains("Run cargo build and pnpm build"),
        "Expected streaming chunk"
    );
    assert!(view.contains("▌"), "Expected streaming cursor block");
}

#[test]
fn test_tool_call_lifecycle_rendering() {
    let backend = TestBackend::new(100, 24);
    let mut terminal = Terminal::new(backend).unwrap();

    let mut app = App::new();
    app.apply_backend_message(ToTuiMessage::ToolCall {
        id: "call_1".to_string(),
        name: "fs_read_file".to_string(),
        args: serde_json::json!({ "path": "src/main.rs" }),
    });

    terminal.draw(|f| ui::render_app(f, &app)).unwrap();
    let view_running = terminal.backend().to_string();
    assert!(view_running.contains("fs_read_file"));
    assert!(view_running.contains("path=\"src/main.rs\""));

    // Complete tool call
    app.apply_backend_message(ToTuiMessage::ToolResult {
        call_id: "call_1".to_string(),
        is_error: false,
        content: "fn main() {}".to_string(),
        duration_ms: Some(42),
    });

    terminal.draw(|f| ui::render_app(f, &app)).unwrap();
    let view_done = terminal.backend().to_string();
    assert!(view_done.contains("⚙"));
    assert!(view_done.contains("(42ms)"));
    assert!(view_done.contains("fn main() {}"));
}

#[test]
fn test_approval_modal_interaction() {
    let backend = TestBackend::new(100, 24);
    let mut terminal = Terminal::new(backend).unwrap();

    let mut app = App::new();
    app.apply_backend_message(ToTuiMessage::ApprovalRequest {
        id: "req_1".to_string(),
        tool_name: "fs_write_file".to_string(),
        args: serde_json::json!({ "path": "/workspace/secret.txt" }),
        tier: 2,
        reason: Some("Writing outside workspace".to_string()),
    });

    terminal.draw(|f| ui::render_app(f, &app)).unwrap();
    let view = terminal.backend().to_string();
    assert!(view.contains("PERMISSION REQUIRED: fs_write_file"));
    assert!(view.contains("Tier 2"));
    assert!(view.contains("Writing outside workspace"));

    // Press 'y' to allow once
    let decision = app.handle_key(KeyEvent::new(KeyCode::Char('y'), KeyModifiers::NONE));
    assert_eq!(
        decision,
        Some(FromTuiMessage::ApprovalDecision {
            request_id: "req_1".to_string(),
            decision: "allow_once".to_string(),
            edited_args: None,
        })
    );
    assert!(app.approval_modal.is_none());
}

#[test]
fn test_tier4_approval_modal_confirmation() {
    let mut app = App::new();
    app.apply_backend_message(ToTuiMessage::ApprovalRequest {
        id: "req_destruct".to_string(),
        tool_name: "rm_rf".to_string(),
        args: serde_json::json!({ "path": "/tmp/test" }),
        tier: 4,
        reason: Some("Irreversible operation".to_string()),
    });

    // Pressing a non-confirm character appends to typed buffer
    app.handle_key(KeyEvent::new(KeyCode::Char('x'), KeyModifiers::NONE));
    assert_eq!(app.approval_modal.as_ref().unwrap().typed_confirm, "x");

    // Clear with backspace
    app.handle_key(KeyEvent::new(KeyCode::Backspace, KeyModifiers::NONE));
    assert_eq!(app.approval_modal.as_ref().unwrap().typed_confirm, "");

    // Typing CONFIRM
    for c in "CONFIRM".chars() {
        app.handle_key(KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE));
    }
    // Press Enter
    let decision_enter = app.handle_key(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE));
    assert_eq!(
        decision_enter,
        Some(FromTuiMessage::ApprovalDecision {
            request_id: "req_destruct".to_string(),
            decision: "allow_once".to_string(),
            edited_args: None,
        })
    );
}

#[test]
fn test_input_line_editing_and_interrupt() {
    let mut app = App::new();

    // Type text
    for c in "hello world".chars() {
        app.handle_key(KeyEvent::new(KeyCode::Char(c), KeyModifiers::NONE));
    }
    assert_eq!(app.input, "hello world");

    // Backspace
    app.handle_key(KeyEvent::new(KeyCode::Backspace, KeyModifiers::NONE));
    assert_eq!(app.input, "hello worl");

    // Enter submits
    let submit = app.handle_key(KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE));
    assert_eq!(
        submit,
        Some(FromTuiMessage::UserInput {
            text: "hello worl".to_string()
        })
    );
    assert_eq!(app.input, "");
    assert!(app.is_processing);

    // Esc interrupts while processing
    let interrupt = app.handle_key(KeyEvent::new(KeyCode::Esc, KeyModifiers::NONE));
    assert_eq!(interrupt, Some(FromTuiMessage::Interrupt));
}

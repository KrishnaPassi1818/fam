use crate::protocol::{FromTuiMessage, ToTuiMessage};
use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

#[derive(Debug, Clone, PartialEq)]
pub struct DisplayMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub model: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ToolStatus {
    Running,
    Completed,
    Error,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ActiveTool {
    pub id: String,
    pub name: String,
    pub args: serde_json::Value,
    pub status: ToolStatus,
    pub result: Option<String>,
    pub duration_ms: Option<u64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct StatusInfo {
    pub model: String,
    pub used_tokens: usize,
    pub max_ctx: usize,
    pub tier: String,
    pub is_local: bool,
    pub cwd: String,
    pub tokens_per_sec: Option<f64>,
    pub role: String,
}

impl Default for StatusInfo {
    fn default() -> Self {
        Self {
            model: "qwen3.5:4b".to_string(),
            used_tokens: 0,
            max_ctx: 4096,
            tier: "medium".to_string(),
            is_local: true,
            cwd: std::env::current_dir()
                .map(|p| p.display().to_string())
                .unwrap_or_else(|_| ".".to_string()),
            tokens_per_sec: None,
            role: "assistant".to_string(),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ApprovalState {
    pub request_id: String,
    pub tool_name: String,
    pub args: serde_json::Value,
    pub tier: u8,
    pub reason: Option<String>,
    pub typed_confirm: String,
    pub show_details: bool,
}

pub struct App {
    pub messages: Vec<DisplayMessage>,
    pub active_delta: Option<String>,
    pub active_tools: Vec<ActiveTool>,
    pub input: String,
    pub input_cursor: usize,
    pub input_history: Vec<String>,
    pub history_index: Option<usize>,
    pub is_processing: bool,
    pub scroll_offset: u16,
    pub auto_scroll: bool,
    pub spinner_tick: usize,
    pub status: StatusInfo,
    pub approval_modal: Option<ApprovalState>,
    pub should_quit: bool,
}

impl Default for App {
    fn default() -> Self {
        Self::new()
    }
}

impl App {
    pub fn new() -> Self {
        Self {
            messages: Vec::new(),
            active_delta: None,
            active_tools: Vec::new(),
            input: String::new(),
            input_cursor: 0,
            input_history: Vec::new(),
            history_index: None,
            is_processing: false,
            scroll_offset: 0,
            auto_scroll: true,
            spinner_tick: 0,
            status: StatusInfo::default(),
            approval_modal: None,
            should_quit: false,
        }
    }

    pub fn tick(&mut self) {
        self.spinner_tick = self.spinner_tick.wrapping_add(1);
    }

    pub fn spinner_char(&self) -> &'static str {
        const SPINNER: &[&str] = &["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
        SPINNER[self.spinner_tick % SPINNER.len()]
    }

    pub fn apply_backend_message(&mut self, msg: ToTuiMessage) {
        match msg {
            ToTuiMessage::Init {
                model,
                max_ctx,
                tier,
                is_local,
                cwd,
                role,
            } => {
                self.status.model = model;
                self.status.max_ctx = max_ctx;
                self.status.tier = tier;
                self.status.is_local = is_local;
                self.status.cwd = cwd;
                self.status.role = role;
            }
            ToTuiMessage::Message {
                id,
                role,
                content,
                model,
            } => {
                if role == "system" && content.contains("interrupted") {
                    self.active_delta = None;
                    self.is_processing = false;
                }
                self.messages.push(DisplayMessage {
                    id,
                    role,
                    content,
                    model,
                });
                if self.auto_scroll {
                    self.scroll_to_bottom();
                }
            }
            ToTuiMessage::Chunk {
                delta,
                tokens_per_sec,
            } => {
                if let Some(tps) = tokens_per_sec {
                    self.status.tokens_per_sec = Some(tps);
                }
                match &mut self.active_delta {
                    Some(existing) => existing.push_str(&delta),
                    None => self.active_delta = Some(delta),
                }
                if self.auto_scroll {
                    self.scroll_to_bottom();
                }
            }
            ToTuiMessage::ToolCall { id, name, args } => {
                self.active_tools.push(ActiveTool {
                    id,
                    name,
                    args,
                    status: ToolStatus::Running,
                    result: None,
                    duration_ms: None,
                });
            }
            ToTuiMessage::ToolResult {
                call_id,
                is_error,
                content,
                duration_ms,
            } => {
                if let Some(tool) = self.active_tools.iter_mut().find(|t| t.id == call_id) {
                    tool.status = if is_error {
                        ToolStatus::Error
                    } else {
                        ToolStatus::Completed
                    };
                    tool.result = Some(content);
                    tool.duration_ms = duration_ms;
                }
            }
            ToTuiMessage::Status {
                used_tokens,
                tokens_per_sec,
                model,
                max_ctx,
                tier,
                is_local,
                cwd,
            } => {
                self.status.used_tokens = used_tokens;
                if let Some(tps) = tokens_per_sec {
                    self.status.tokens_per_sec = Some(tps);
                }
                if let Some(m) = model {
                    self.status.model = m;
                }
                if let Some(mc) = max_ctx {
                    self.status.max_ctx = mc;
                }
                if let Some(t) = tier {
                    self.status.tier = t;
                }
                if let Some(loc) = is_local {
                    self.status.is_local = loc;
                }
                if let Some(c) = cwd {
                    self.status.cwd = c;
                }
            }
            ToTuiMessage::Warning { message } => {
                self.messages.push(DisplayMessage {
                    id: format!("w_{}", self.messages.len()),
                    role: "system".to_string(),
                    content: format!("⚠ {}", message),
                    model: None,
                });
            }
            ToTuiMessage::ApprovalRequest {
                id,
                tool_name,
                args,
                tier,
                reason,
            } => {
                self.approval_modal = Some(ApprovalState {
                    request_id: id,
                    tool_name,
                    args,
                    tier,
                    reason,
                    typed_confirm: String::new(),
                    show_details: false,
                });
            }
            ToTuiMessage::Finish {
                response,
                total_tokens,
            } => {
                self.status.used_tokens = total_tokens;
                let model_name = self.status.model.clone();
                self.messages.push(DisplayMessage {
                    id: format!("resp_{}", self.messages.len()),
                    role: "assistant".to_string(),
                    content: response,
                    model: Some(model_name),
                });
                self.active_delta = None;
                self.is_processing = false;
                if self.auto_scroll {
                    self.scroll_to_bottom();
                }
            }
            ToTuiMessage::Error { message } => {
                self.messages.push(DisplayMessage {
                    id: format!("err_{}", self.messages.len()),
                    role: "system".to_string(),
                    content: format!("✖ Error: {}", message),
                    model: None,
                });
                self.active_delta = None;
                self.is_processing = false;
            }
            ToTuiMessage::Clear => {
                self.messages.clear();
                self.active_delta = None;
                self.active_tools.clear();
                self.scroll_offset = 0;
            }
            ToTuiMessage::Exit => {
                self.should_quit = true;
            }
        }
    }

    pub fn handle_key(&mut self, key: KeyEvent) -> Option<FromTuiMessage> {
        // 1. Handle Approval Modal if active
        if let Some(ref mut modal) = self.approval_modal {
            if modal.tier == 4 {
                // Tier 4 typed confirmation
                match key.code {
                    KeyCode::Enter => {
                        let text = modal.typed_confirm.trim();
                        let decision = if text == "CONFIRM" {
                            "allow_once"
                        } else {
                            "deny"
                        };
                        let req_id = modal.request_id.clone();
                        self.approval_modal = None;
                        return Some(FromTuiMessage::ApprovalDecision {
                            request_id: req_id,
                            decision: decision.to_string(),
                            edited_args: None,
                        });
                    }
                    KeyCode::Esc => {
                        let req_id = modal.request_id.clone();
                        self.approval_modal = None;
                        return Some(FromTuiMessage::ApprovalDecision {
                            request_id: req_id,
                            decision: "deny".to_string(),
                            edited_args: None,
                        });
                    }
                    KeyCode::Backspace => {
                        modal.typed_confirm.pop();
                        return None;
                    }
                    KeyCode::Char(c) => {
                        modal.typed_confirm.push(c);
                        return None;
                    }
                    _ => return None,
                }
            } else {
                // Normal Tiers (1, 2, 3)
                match key.code {
                    KeyCode::Char('y') | KeyCode::Char('Y') => {
                        let req_id = modal.request_id.clone();
                        self.approval_modal = None;
                        return Some(FromTuiMessage::ApprovalDecision {
                            request_id: req_id,
                            decision: "allow_once".to_string(),
                            edited_args: None,
                        });
                    }
                    KeyCode::Char('a') | KeyCode::Char('A') => {
                        let req_id = modal.request_id.clone();
                        self.approval_modal = None;
                        return Some(FromTuiMessage::ApprovalDecision {
                            request_id: req_id,
                            decision: "allow_session".to_string(),
                            edited_args: None,
                        });
                    }
                    KeyCode::Char('n') | KeyCode::Char('N') | KeyCode::Esc => {
                        let req_id = modal.request_id.clone();
                        self.approval_modal = None;
                        return Some(FromTuiMessage::ApprovalDecision {
                            request_id: req_id,
                            decision: "deny".to_string(),
                            edited_args: None,
                        });
                    }
                    KeyCode::Char('e') | KeyCode::Char('E') => {
                        let req_id = modal.request_id.clone();
                        let args = modal.args.clone();
                        self.approval_modal = None;
                        return Some(FromTuiMessage::ApprovalDecision {
                            request_id: req_id,
                            decision: "edit_args".to_string(),
                            edited_args: Some(args),
                        });
                    }
                    KeyCode::Char('?') => {
                        modal.show_details = !modal.show_details;
                        return None;
                    }
                    _ => return None,
                }
            }
        }

        // 2. Global Hotkeys
        if key.modifiers.contains(KeyModifiers::CONTROL) && key.code == KeyCode::Char('c') {
            self.should_quit = true;
            return Some(FromTuiMessage::Exit);
        }

        if key.code == KeyCode::Esc && self.is_processing {
            return Some(FromTuiMessage::Interrupt);
        }

        // 3. Scroll Navigation
        match key.code {
            KeyCode::PageUp => {
                self.scroll_offset = self.scroll_offset.saturating_add(5);
                self.auto_scroll = false;
                return None;
            }
            KeyCode::PageDown => {
                self.scroll_offset = self.scroll_offset.saturating_sub(5);
                if self.scroll_offset == 0 {
                    self.auto_scroll = true;
                }
                return None;
            }
            _ => {}
        }

        // 4. Input Line Navigation & History
        match key.code {
            KeyCode::Enter => {
                let text = self.input.trim().to_string();
                if text.is_empty() {
                    return None;
                }
                self.input.clear();
                self.input_cursor = 0;
                self.input_history.push(text.clone());
                self.history_index = None;
                self.is_processing = true;
                self.auto_scroll = true;
                Some(FromTuiMessage::UserInput { text })
            }
            KeyCode::Backspace => {
                if self.input_cursor > 0 && self.input_cursor <= self.input.len() {
                    self.input.remove(self.input_cursor - 1);
                    self.input_cursor -= 1;
                }
                None
            }
            KeyCode::Delete => {
                if self.input_cursor < self.input.len() {
                    self.input.remove(self.input_cursor);
                }
                None
            }
            KeyCode::Left => {
                if self.input_cursor > 0 {
                    self.input_cursor -= 1;
                }
                None
            }
            KeyCode::Right => {
                if self.input_cursor < self.input.len() {
                    self.input_cursor += 1;
                }
                None
            }
            KeyCode::Home => {
                self.input_cursor = 0;
                None
            }
            KeyCode::End => {
                self.input_cursor = self.input.len();
                None
            }
            KeyCode::Up => {
                if !self.input_history.is_empty() {
                    let next_index = match self.history_index {
                        Some(idx) => idx.saturating_sub(1),
                        None => self.input_history.len() - 1,
                    };
                    self.history_index = Some(next_index);
                    if let Some(hist_text) = self.input_history.get(next_index) {
                        self.input = hist_text.clone();
                        self.input_cursor = self.input.len();
                    }
                }
                None
            }
            KeyCode::Down => {
                if let Some(idx) = self.history_index {
                    if idx + 1 < self.input_history.len() {
                        let next_index = idx + 1;
                        self.history_index = Some(next_index);
                        if let Some(hist_text) = self.input_history.get(next_index) {
                            self.input = hist_text.clone();
                            self.input_cursor = self.input.len();
                        }
                    } else {
                        self.history_index = None;
                        self.input.clear();
                        self.input_cursor = 0;
                    }
                }
                None
            }
            KeyCode::Char(c) => {
                self.input.insert(self.input_cursor, c);
                self.input_cursor += 1;
                None
            }
            _ => None,
        }
    }

    pub fn scroll_to_bottom(&mut self) {
        self.scroll_offset = 0;
        self.auto_scroll = true;
    }
}

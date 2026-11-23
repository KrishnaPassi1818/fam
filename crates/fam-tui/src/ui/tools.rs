use crate::app::{App, ToolStatus};
use ratatui::{
    buffer::Buffer,
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph, Widget},
};

pub struct ToolsWidget<'a> {
    pub app: &'a App,
}

impl<'a> ToolsWidget<'a> {
    pub fn new(app: &'a App) -> Self {
        Self { app }
    }
}

impl<'a> Widget for ToolsWidget<'a> {
    fn render(self, area: Rect, buf: &mut Buffer) {
        if self.app.active_tools.is_empty() {
            return;
        }

        let mut lines = Vec::new();

        for tool in &self.app.active_tools {
            let mut spans = Vec::new();

            // Status Icon
            match tool.status {
                ToolStatus::Running => {
                    spans.push(Span::styled(
                        format!("  {} ", self.app.spinner_char()),
                        Style::default()
                            .fg(Color::Yellow)
                            .add_modifier(Modifier::BOLD),
                    ));
                }
                ToolStatus::Completed => {
                    spans.push(Span::styled(
                        "  ⚙ ",
                        Style::default()
                            .fg(Color::Green)
                            .add_modifier(Modifier::BOLD),
                    ));
                }
                ToolStatus::Error => {
                    spans.push(Span::styled(
                        "  ✖ ",
                        Style::default().fg(Color::Red).add_modifier(Modifier::BOLD),
                    ));
                }
            }

            // Tool Name
            spans.push(Span::styled(
                &tool.name,
                Style::default()
                    .fg(Color::Cyan)
                    .add_modifier(Modifier::BOLD),
            ));

            // Args Summary
            let args_str = format_args_summary(&tool.args);
            spans.push(Span::styled(
                format!(" ({})", args_str),
                Style::default().fg(Color::DarkGray),
            ));

            // Short Result
            if let Some(res) = &tool.result {
                let short_res = if res.len() > 60 {
                    format!("{}...", &res[..57])
                } else {
                    res.clone()
                };

                let res_color = if tool.status == ToolStatus::Error {
                    Color::Red
                } else {
                    Color::DarkGray
                };
                spans.push(Span::styled(
                    format!(" → {}", short_res),
                    Style::default().fg(res_color),
                ));
            }

            // Duration
            if let Some(ms) = tool.duration_ms {
                spans.push(Span::styled(
                    format!(" ({}ms)", ms),
                    Style::default().fg(Color::DarkGray),
                ));
            }

            lines.push(Line::from(spans));
        }

        let block = Block::default()
            .borders(Borders::ALL)
            .title(" Tool Execution ")
            .border_style(Style::default().fg(Color::DarkGray));

        let paragraph = Paragraph::new(lines).block(block);
        paragraph.render(area, buf);
    }
}

fn format_args_summary(args: &serde_json::Value) -> String {
    if let Some(obj) = args.as_object() {
        obj.iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect::<Vec<_>>()
            .join(", ")
    } else {
        args.to_string()
    }
}

use crate::app::App;
use ratatui::{
    buffer::Buffer,
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span, Text},
    widgets::{Block, Borders, Paragraph, Widget, Wrap},
};

pub struct MessagesWidget<'a> {
    pub app: &'a App,
}

impl<'a> MessagesWidget<'a> {
    pub fn new(app: &'a App) -> Self {
        Self { app }
    }
}

impl<'a> Widget for MessagesWidget<'a> {
    fn render(self, area: Rect, buf: &mut Buffer) {
        let mut lines: Vec<Line> = Vec::new();

        // 1. Existing Messages
        for msg in &self.app.messages {
            match msg.role.as_str() {
                "user" => {
                    lines.push(Line::from(vec![
                        Span::styled(
                            "User > ",
                            Style::default()
                                .fg(Color::Blue)
                                .add_modifier(Modifier::BOLD),
                        ),
                        Span::styled(&msg.content, Style::default().fg(Color::White)),
                    ]));
                    lines.push(Line::raw(""));
                }
                "assistant" => {
                    let model_label = msg
                        .model
                        .as_deref()
                        .map(|m| format!("hx ({}) > ", m))
                        .unwrap_or_else(|| "hx > ".to_string());

                    lines.push(Line::from(vec![
                        Span::styled(
                            model_label,
                            Style::default()
                                .fg(Color::Green)
                                .add_modifier(Modifier::BOLD),
                        ),
                        Span::styled(&msg.content, Style::default().fg(Color::White)),
                    ]));
                    lines.push(Line::raw(""));
                }
                "system" => {
                    lines.push(Line::from(vec![
                        Span::styled(
                            "ℹ System: ",
                            Style::default()
                                .fg(Color::Yellow)
                                .add_modifier(Modifier::BOLD),
                        ),
                        Span::styled(&msg.content, Style::default().fg(Color::Yellow)),
                    ]));
                    lines.push(Line::raw(""));
                }
                _ => {
                    lines.push(Line::from(vec![
                        Span::styled(
                            format!("{}: ", msg.role),
                            Style::default()
                                .fg(Color::Magenta)
                                .add_modifier(Modifier::BOLD),
                        ),
                        Span::styled(&msg.content, Style::default().fg(Color::White)),
                    ]));
                    lines.push(Line::raw(""));
                }
            }
        }

        // 2. Active Streaming Delta
        if let Some(delta) = &self.app.active_delta {
            let model_label = format!("hx ({}) > ", self.app.status.model);
            lines.push(Line::from(vec![
                Span::styled(
                    model_label,
                    Style::default()
                        .fg(Color::Green)
                        .add_modifier(Modifier::BOLD),
                ),
                Span::styled(delta, Style::default().fg(Color::White)),
                Span::styled(
                    "▌",
                    Style::default()
                        .fg(Color::Green)
                        .add_modifier(Modifier::SLOW_BLINK),
                ),
            ]));
            lines.push(Line::raw(""));
        }

        let total_lines = lines.len() as u16;
        let viewport_height = area.height.saturating_sub(2); // subtract borders

        // Calculate scroll offset
        let scroll_y = if self.app.auto_scroll {
            total_lines.saturating_sub(viewport_height)
        } else {
            let max_scroll = total_lines.saturating_sub(viewport_height);
            max_scroll.saturating_sub(self.app.scroll_offset)
        };

        let block = Block::default()
            .borders(Borders::ALL)
            .title(" Conversation ")
            .border_style(Style::default().fg(Color::DarkGray));

        let paragraph = Paragraph::new(Text::from(lines))
            .block(block)
            .wrap(Wrap { trim: false })
            .scroll((scroll_y, 0));

        paragraph.render(area, buf);
    }
}

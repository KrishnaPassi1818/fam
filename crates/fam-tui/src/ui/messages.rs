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
            let (prefix, prefix_style, content_style) = match msg.role.as_str() {
                "user" => (
                    "User > ".to_string(),
                    Style::default()
                        .fg(Color::Blue)
                        .add_modifier(Modifier::BOLD),
                    Style::default().fg(Color::White),
                ),
                "assistant" => (
                    msg.model
                        .as_deref()
                        .map(|m| format!("fam ({}) > ", m))
                        .unwrap_or_else(|| "fam > ".to_string()),
                    Style::default()
                        .fg(Color::Green)
                        .add_modifier(Modifier::BOLD),
                    Style::default().fg(Color::White),
                ),
                "system" => (
                    "ℹ System: ".to_string(),
                    Style::default()
                        .fg(Color::Yellow)
                        .add_modifier(Modifier::BOLD),
                    Style::default().fg(Color::Yellow),
                ),
                _ => (
                    format!("{}: ", msg.role),
                    Style::default()
                        .fg(Color::Magenta)
                        .add_modifier(Modifier::BOLD),
                    Style::default().fg(Color::White),
                ),
            };

            push_multiline_message(
                &mut lines,
                prefix,
                prefix_style,
                &msg.content,
                content_style,
            );
            lines.push(Line::raw(""));
        }

        // 2. Active Streaming Delta
        if let Some(delta) = &self.app.active_delta {
            let model_label = format!("fam ({}) > ", self.app.status.model);
            let prefix_style = Style::default()
                .fg(Color::Green)
                .add_modifier(Modifier::BOLD);
            let content_style = Style::default().fg(Color::White);
            let start_idx = lines.len();
            push_multiline_message(&mut lines, model_label, prefix_style, delta, content_style);
            if lines.len() > start_idx {
                if let Some(last_line) = lines.last_mut() {
                    last_line.spans.push(Span::styled(
                        "▌",
                        Style::default()
                            .fg(Color::Green)
                            .add_modifier(Modifier::SLOW_BLINK),
                    ));
                }
            }
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

fn push_multiline_message<'a>(
    lines: &mut Vec<Line<'a>>,
    prefix: String,
    prefix_style: Style,
    content: &'a str,
    content_style: Style,
) {
    let mut split = content.split('\n');
    let first = split.next().unwrap_or("");
    lines.push(Line::from(vec![
        Span::styled(prefix, prefix_style),
        Span::styled(first, content_style),
    ]));
    for line in split {
        lines.push(Line::from(Span::styled(line, content_style)));
    }
}

use crate::app::App;
use ratatui::{
    buffer::Buffer,
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph, Widget},
};

pub struct InputWidget<'a> {
    pub app: &'a App,
}

impl<'a> InputWidget<'a> {
    pub fn new(app: &'a App) -> Self {
        Self { app }
    }
}

impl<'a> Widget for InputWidget<'a> {
    fn render(self, area: Rect, buf: &mut Buffer) {
        let block =
            Block::default()
                .borders(Borders::ALL)
                .border_style(if self.app.is_processing {
                    Style::default().fg(Color::DarkGray)
                } else {
                    Style::default().fg(Color::Cyan)
                });

        let line = if self.app.is_processing {
            Line::from(vec![
                Span::styled(
                    "fam > ",
                    Style::default()
                        .fg(Color::DarkGray)
                        .add_modifier(Modifier::BOLD),
                ),
                Span::styled(
                    "Processing... (Press Esc to interrupt)",
                    Style::default().fg(Color::DarkGray),
                ),
            ])
        } else if self.app.input.is_empty() {
            Line::from(vec![
                Span::styled(
                    "fam > ",
                    Style::default()
                        .fg(Color::Cyan)
                        .add_modifier(Modifier::BOLD),
                ),
                Span::styled(
                    "Ask a question or type /help",
                    Style::default().fg(Color::DarkGray),
                ),
            ])
        } else {
            Line::from(vec![
                Span::styled(
                    "fam > ",
                    Style::default()
                        .fg(Color::Cyan)
                        .add_modifier(Modifier::BOLD),
                ),
                Span::styled(&self.app.input, Style::default().fg(Color::White)),
            ])
        };

        let paragraph = Paragraph::new(line).block(block);
        paragraph.render(area, buf);
    }
}

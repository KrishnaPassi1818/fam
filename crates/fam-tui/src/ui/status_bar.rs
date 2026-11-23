use crate::app::StatusInfo;
use ratatui::{
    buffer::Buffer,
    layout::Rect,
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph, Widget},
};

pub struct StatusBarWidget<'a> {
    pub status: &'a StatusInfo,
}

impl<'a> StatusBarWidget<'a> {
    pub fn new(status: &'a StatusInfo) -> Self {
        Self { status }
    }
}

impl<'a> Widget for StatusBarWidget<'a> {
    fn render(self, area: Rect, buf: &mut Buffer) {
        let used_k = self.status.used_tokens as f64 / 1000.0;
        let max_k = self.status.max_ctx as f64 / 1000.0;
        let ctx_str = format!("ctx {:.1}k/{:.0}k", used_k, max_k);

        let location_badge = if self.status.is_local {
            "LOCAL"
        } else {
            "CLOUD"
        };
        let location_color = if self.status.is_local {
            Color::Green
        } else {
            Color::Magenta
        };

        let mut spans = vec![
            Span::styled(
                &self.status.model,
                Style::default()
                    .fg(Color::Cyan)
                    .add_modifier(Modifier::BOLD),
            ),
            Span::styled(" · ", Style::default().fg(Color::DarkGray)),
            Span::styled(ctx_str, Style::default().fg(Color::Yellow)),
            Span::styled(" · ", Style::default().fg(Color::DarkGray)),
            Span::styled(&self.status.tier, Style::default().fg(Color::Blue)),
        ];

        if let Some(tps) = self.status.tokens_per_sec {
            if tps > 0.0 {
                spans.push(Span::styled(" · ", Style::default().fg(Color::DarkGray)));
                spans.push(Span::styled(
                    format!("{:.1} tok/s", tps),
                    Style::default().fg(Color::Green),
                ));
            }
        }

        spans.push(Span::styled(" · ", Style::default().fg(Color::DarkGray)));
        spans.push(Span::styled(
            location_badge,
            Style::default()
                .fg(location_color)
                .add_modifier(Modifier::BOLD),
        ));

        spans.push(Span::styled(" · ", Style::default().fg(Color::DarkGray)));
        spans.push(Span::styled(
            &self.status.cwd,
            Style::default().fg(Color::DarkGray),
        ));

        let paragraph = Paragraph::new(Line::from(spans)).block(
            Block::default()
                .borders(Borders::ALL)
                .border_style(Style::default().fg(Color::DarkGray)),
        );

        paragraph.render(area, buf);
    }
}

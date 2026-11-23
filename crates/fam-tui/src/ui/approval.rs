use crate::app::ApprovalState;
use ratatui::{
    buffer::Buffer,
    layout::{Alignment, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span, Text},
    widgets::{Block, Borders, Clear, Paragraph, Widget},
};

pub struct ApprovalModalWidget<'a> {
    pub state: &'a ApprovalState,
}

impl<'a> ApprovalModalWidget<'a> {
    pub fn new(state: &'a ApprovalState) -> Self {
        Self { state }
    }
}

impl<'a> Widget for ApprovalModalWidget<'a> {
    fn render(self, area: Rect, buf: &mut Buffer) {
        // Clear background
        Clear.render(area, buf);

        let (tier_color, tier_label) = match self.state.tier {
            0 => (Color::Cyan, "Tier 0 (Read-Only)"),
            1 => (Color::Green, "Tier 1 (Workspace Write)"),
            2 => (Color::Yellow, "Tier 2 (External Write / Overwrite)"),
            3 => (Color::Magenta, "Tier 3 (Shell / Process / Network)"),
            _ => (Color::Red, "Tier 4 (Destructive / Irreversible)"),
        };

        let block = Block::default()
            .borders(Borders::ALL)
            .title(Span::styled(
                format!(" PERMISSION REQUIRED: {} ", self.state.tool_name),
                Style::default()
                    .fg(Color::White)
                    .add_modifier(Modifier::BOLD),
            ))
            .border_style(Style::default().fg(tier_color).add_modifier(Modifier::BOLD));

        let mut lines = Vec::new();

        lines.push(Line::from(vec![
            Span::styled("Risk Level: ", Style::default().fg(Color::White)),
            Span::styled(
                tier_label,
                Style::default().fg(tier_color).add_modifier(Modifier::BOLD),
            ),
        ]));

        if let Some(reason) = &self.state.reason {
            lines.push(Line::from(vec![
                Span::styled("Reason: ", Style::default().fg(Color::DarkGray)),
                Span::styled(reason, Style::default().fg(Color::White)),
            ]));
        }

        lines.push(Line::raw(""));

        // Previews from args
        if let Some(obj) = self.state.args.as_object() {
            if let Some(cmd) = obj.get("command").or_else(|| obj.get("cmd")) {
                lines.push(Line::from(vec![
                    Span::styled(
                        "Command: ",
                        Style::default()
                            .fg(Color::Yellow)
                            .add_modifier(Modifier::BOLD),
                    ),
                    Span::styled(cmd.to_string(), Style::default().fg(Color::White)),
                ]));
            }
            if let Some(path) = obj
                .get("path")
                .or_else(|| obj.get("file"))
                .or_else(|| obj.get("target"))
            {
                lines.push(Line::from(vec![
                    Span::styled(
                        "Target Path: ",
                        Style::default()
                            .fg(Color::Cyan)
                            .add_modifier(Modifier::BOLD),
                    ),
                    Span::styled(path.to_string(), Style::default().fg(Color::White)),
                ]));
            }
            if let Some(content) = obj
                .get("diff")
                .or_else(|| obj.get("content"))
                .or_else(|| obj.get("replacement"))
            {
                let content_str = content.to_string();
                let preview = if content_str.len() > 100 {
                    format!("{}...", &content_str[..97])
                } else {
                    content_str
                };
                lines.push(Line::from(vec![
                    Span::styled("Content: ", Style::default().fg(Color::Green)),
                    Span::styled(preview, Style::default().fg(Color::DarkGray)),
                ]));
            }
        }

        if self.state.show_details {
            lines.push(Line::raw(""));
            lines.push(Line::styled(
                format!("Full Arguments: {}", self.state.args),
                Style::default().fg(Color::DarkGray),
            ));
        }

        lines.push(Line::raw(""));

        // Decision Prompt
        if self.state.tier == 4 {
            lines.push(Line::styled(
                "Type 'CONFIRM' and press Enter to approve, or Esc to cancel:",
                Style::default().fg(Color::Red).add_modifier(Modifier::BOLD),
            ));
            lines.push(Line::from(vec![
                Span::styled(
                    "> ",
                    Style::default().fg(Color::Red).add_modifier(Modifier::BOLD),
                ),
                Span::styled(
                    &self.state.typed_confirm,
                    Style::default()
                        .fg(Color::White)
                        .add_modifier(Modifier::BOLD),
                ),
                Span::styled("▌", Style::default().fg(Color::Red)),
            ]));
        } else {
            lines.push(Line::from(vec![
                Span::styled(
                    "[y] ",
                    Style::default()
                        .fg(Color::Green)
                        .add_modifier(Modifier::BOLD),
                ),
                Span::raw("Allow Once   "),
                Span::styled(
                    "[a] ",
                    Style::default()
                        .fg(Color::Cyan)
                        .add_modifier(Modifier::BOLD),
                ),
                Span::raw("Allow for Session   "),
                Span::styled(
                    "[n/Esc] ",
                    Style::default().fg(Color::Red).add_modifier(Modifier::BOLD),
                ),
                Span::raw("Deny   "),
                Span::styled(
                    "[?] ",
                    Style::default()
                        .fg(Color::Yellow)
                        .add_modifier(Modifier::BOLD),
                ),
                Span::raw("Details"),
            ]));
        }

        let paragraph = Paragraph::new(Text::from(lines))
            .block(block)
            .alignment(Alignment::Left);

        paragraph.render(area, buf);
    }
}

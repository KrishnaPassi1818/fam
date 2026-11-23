pub mod approval;
pub mod input;
pub mod messages;
pub mod status_bar;
pub mod tools;

use crate::app::App;
use approval::ApprovalModalWidget;
use input::InputWidget;
use messages::MessagesWidget;
use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    Frame,
};
use status_bar::StatusBarWidget;
use tools::ToolsWidget;

pub fn render_app(frame: &mut Frame, app: &App) {
    let size = frame.area();

    // Check if tools exist to allocate vertical section
    let has_tools = !app.active_tools.is_empty();
    let tools_height = if has_tools {
        (app.active_tools.len() as u16 + 2).min(6)
    } else {
        0
    };

    let constraints = if has_tools {
        vec![
            Constraint::Min(5),               // Messages
            Constraint::Length(tools_height), // Tools
            Constraint::Length(3),            // Input
            Constraint::Length(3),            // Status Bar
        ]
    } else {
        vec![
            Constraint::Min(5),    // Messages
            Constraint::Length(3), // Input
            Constraint::Length(3), // Status Bar
        ]
    };

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints(constraints)
        .split(size);

    if has_tools {
        frame.render_widget(MessagesWidget::new(app), chunks[0]);
        frame.render_widget(ToolsWidget::new(app), chunks[1]);
        frame.render_widget(InputWidget::new(app), chunks[2]);
        frame.render_widget(StatusBarWidget::new(&app.status), chunks[3]);
    } else {
        frame.render_widget(MessagesWidget::new(app), chunks[0]);
        frame.render_widget(InputWidget::new(app), chunks[1]);
        frame.render_widget(StatusBarWidget::new(&app.status), chunks[2]);
    }

    // Render Approval Modal Overlay if active
    if let Some(ref modal) = app.approval_modal {
        let popup_area = centered_rect(70, 50, size);
        frame.render_widget(ApprovalModalWidget::new(modal), popup_area);
    }
}

pub fn centered_rect(percent_x: u16, percent_y: u16, r: Rect) -> Rect {
    let popup_layout = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Percentage((100 - percent_y) / 2),
            Constraint::Percentage(percent_y),
            Constraint::Percentage((100 - percent_y) / 2),
        ])
        .split(r);

    Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage((100 - percent_x) / 2),
            Constraint::Percentage(percent_x),
            Constraint::Percentage((100 - percent_x) / 2),
        ])
        .split(popup_layout[1])[1]
}

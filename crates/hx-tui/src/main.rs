use anyhow::{Context, Result};
use clap::Parser;
use crossterm::{
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use hx_tui::{
    app::App,
    event::{Event, EventHandler},
    protocol::{FromTuiMessage, ToTuiMessage},
    ui,
};
use ratatui::{backend::CrosstermBackend, Terminal};
use std::{
    io::{self, BufRead, BufReader, Write},
    process::{Command, Stdio},
    sync::mpsc,
    thread,
    time::Duration,
};

#[derive(Parser, Debug)]
#[command(
    name = "hx-tui",
    version,
    about = "Ratatui TUI frontend for hx agent harness"
)]
struct Args {
    /// Connect directly to standard input/output for IPC
    #[arg(long)]
    stdio: bool,

    /// Command to spawn the backend harness process
    #[arg(long)]
    backend_cmd: Option<String>,

    /// Initial model
    #[arg(long)]
    model: Option<String>,

    /// Initial role
    #[arg(long)]
    role: Option<String>,
}

fn main() -> Result<()> {
    let args = Args::parse();

    // Channel for messages from backend to TUI
    let (backend_tx, backend_rx) = mpsc::channel::<ToTuiMessage>();

    // Channel for messages from TUI to backend
    let (tui_tx, tui_rx) = mpsc::channel::<FromTuiMessage>();

    // Determine backend connection
    if let Some(cmd_str) = &args.backend_cmd {
        // Spawn backend process
        let mut child = Command::new("sh")
            .arg("-c")
            .arg(cmd_str)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .with_context(|| format!("Failed to spawn backend process: {}", cmd_str))?;

        let child_stdout = child.stdout.take().context("Failed to open child stdout")?;
        let mut child_stdin = child.stdin.take().context("Failed to open child stdin")?;

        // Reader thread: child stdout -> backend_tx
        thread::spawn(move || {
            let reader = BufReader::new(child_stdout);
            for line_res in reader.lines() {
                match line_res {
                    Ok(line) => {
                        let trimmed = line.trim();
                        if trimmed.is_empty() {
                            continue;
                        }
                        if let Ok(msg) = serde_json::from_str::<ToTuiMessage>(trimmed) {
                            if backend_tx.send(msg).is_err() {
                                break;
                            }
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        // Writer thread: tui_rx -> child stdin
        thread::spawn(move || {
            while let Ok(msg) = tui_rx.recv() {
                if let Ok(json) = serde_json::to_string(&msg) {
                    if writeln!(child_stdin, "{}", json).is_err() {
                        break;
                    }
                    let _ = child_stdin.flush();
                }
            }
        });
    } else {
        // Direct stdio mode (e.g. hx spawning hx-tui)
        // Note: When stdio is used for IPC, terminal needs /dev/tty
        // Let's check if terminal is tty or if stdio reader should run
    }

    // Run terminal TUI loop
    run_tui(backend_rx, tui_tx, args.model, args.role)
}

fn run_tui(
    backend_rx: mpsc::Receiver<ToTuiMessage>,
    tui_tx: mpsc::Sender<FromTuiMessage>,
    initial_model: Option<String>,
    initial_role: Option<String>,
) -> Result<()> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let mut app = App::new();
    if let Some(m) = initial_model {
        app.status.model = m;
    }
    if let Some(r) = initial_role {
        app.status.role = r;
    }

    let event_handler = EventHandler::new(Duration::from_millis(50));

    loop {
        // Drain any incoming backend messages
        while let Ok(msg) = backend_rx.try_recv() {
            app.apply_backend_message(msg);
        }

        // Draw UI
        terminal.draw(|f| ui::render_app(f, &app))?;

        if app.should_quit {
            break;
        }

        // Wait for next event
        match event_handler.next() {
            Ok(Event::Key(key)) => {
                if let Some(out_msg) = app.handle_key(key) {
                    let _ = tui_tx.send(out_msg);
                }
            }
            Ok(Event::Tick) => {
                app.tick();
            }
            Ok(Event::Resize(_, _)) => {
                // Ratatui handles resize on redraw
            }
            Err(_) => break,
        }
    }

    // Clean exit
    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;

    Ok(())
}

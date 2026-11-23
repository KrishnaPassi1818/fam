use crossterm::event::{self, Event as CrosstermEvent, KeyEvent};
use std::{sync::mpsc, thread, time::Duration};

#[derive(Debug, Clone)]
pub enum Event {
    Key(KeyEvent),
    Tick,
    Resize(u16, u16),
}

pub struct EventHandler {
    receiver: mpsc::Receiver<Event>,
    _handler: thread::JoinHandle<()>,
}

impl EventHandler {
    pub fn new(tick_rate: Duration) -> Self {
        let (sender, receiver) = mpsc::channel();
        let handler = thread::spawn(move || loop {
            if event::poll(tick_rate).unwrap_or(false) {
                match event::read() {
                    Ok(CrosstermEvent::Key(key)) => {
                        if sender.send(Event::Key(key)).is_err() {
                            break;
                        }
                    }
                    Ok(CrosstermEvent::Resize(w, h))
                        if sender.send(Event::Resize(w, h)).is_err() =>
                    {
                        break;
                    }
                    _ => {}
                }
            } else if sender.send(Event::Tick).is_err() {
                break;
            }
        });

        Self {
            receiver,
            _handler: handler,
        }
    }

    pub fn next(&self) -> Result<Event, mpsc::RecvError> {
        self.receiver.recv()
    }
}

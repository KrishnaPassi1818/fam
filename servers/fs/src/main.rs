use anyhow::Result;
use hx_fs::{Confinement, FsServer};
use std::env;
use std::path::PathBuf;

#[tokio::main]
async fn main() -> Result<()> {
    let mut root = env::current_dir()?;

    let args: Vec<String> = env::args().collect();
    let mut i = 1;
    while i < args.len() {
        if args[i] == "--root" && i + 1 < args.len() {
            root = PathBuf::from(&args[i + 1]);
            i += 2;
        } else {
            i += 1;
        }
    }

    let confinement = Confinement::new(&root)?;
    let server = FsServer::new(confinement);

    server.run_stdio().await?;
    Ok(())
}

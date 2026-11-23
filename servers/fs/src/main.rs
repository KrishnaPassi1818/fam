use anyhow::Result;
use fam_fs::{Confinement, FsServer};
use std::env;
use std::path::PathBuf;

#[tokio::main]
async fn main() -> Result<()> {
    let mut root = env::var("FAM_FS_ROOT")
        .or_else(|_| env::var("HX_FS_ROOT"))
        .map(PathBuf::from)
        .unwrap_or_else(|_| env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

    let args: Vec<String> = env::args().collect();
    let mut i = 1;
    while i < args.len() {
        if args[i] == "--root" && i + 1 < args.len() {
            let root_arg = &args[i + 1];
            if root_arg == "~" || root_arg.starts_with("~/") {
                if let Ok(home) = env::var("HOME") {
                    root = PathBuf::from(home).join(root_arg.trim_start_matches("~/"));
                } else {
                    root = PathBuf::from(root_arg);
                }
            } else {
                root = PathBuf::from(root_arg);
            }
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

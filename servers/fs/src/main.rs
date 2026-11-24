use anyhow::Result;
use fam_fs::{Confinement, FsServer};
use std::env;
use std::path::PathBuf;

fn expand_path(p_str: &str) -> PathBuf {
    if p_str == "~" {
        if let Ok(home) = env::var("HOME") {
            PathBuf::from(home)
        } else {
            PathBuf::from(p_str)
        }
    } else if let Some(stripped) = p_str.strip_prefix("~/") {
        if let Ok(home) = env::var("HOME") {
            PathBuf::from(home).join(stripped)
        } else {
            PathBuf::from(p_str)
        }
    } else if p_str == "${HOME}" || p_str == "$HOME" {
        if let Ok(home) = env::var("HOME") {
            PathBuf::from(home)
        } else {
            PathBuf::from(p_str)
        }
    } else if p_str == "." || p_str == "${CWD}" || p_str == "$CWD" {
        env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
    } else {
        PathBuf::from(p_str)
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let mut workspace = env::var("FAM_FS_ROOT")
        .or_else(|_| env::var("FAM_WORKSPACE"))
        .or_else(|_| env::var("HX_FS_ROOT"))
        .map(|s| expand_path(&s))
        .unwrap_or_else(|_| env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

    let mut custom_roots = Vec::new();

    let args: Vec<String> = env::args().collect();
    let mut i = 1;
    while i < args.len() {
        if args[i] == "--root" && i + 1 < args.len() {
            workspace = expand_path(&args[i + 1]);
            i += 2;
        } else if (args[i] == "--authorized-root" || args[i] == "--authorized-roots")
            && i + 1 < args.len()
        {
            let val = &args[i + 1];
            for part in val.split(',') {
                let trimmed = part.trim();
                if !trimmed.is_empty() {
                    custom_roots.push(expand_path(trimmed));
                }
            }
            i += 2;
        } else {
            i += 1;
        }
    }

    let confinement = Confinement::with_authorized_roots(workspace, custom_roots)?;
    let server = FsServer::new(confinement);

    server.run_stdio().await?;
    Ok(())
}

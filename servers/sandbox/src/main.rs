use anyhow::Result;
use fam_sandbox::SandboxServer;

#[tokio::main]
async fn main() -> Result<()> {
    let server = SandboxServer::new();
    server.run_stdio().await
}

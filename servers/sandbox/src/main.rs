use anyhow::Result;
use hx_sandbox::SandboxServer;

#[tokio::main]
async fn main() -> Result<()> {
    let server = SandboxServer::new();
    server.run_stdio().await
}

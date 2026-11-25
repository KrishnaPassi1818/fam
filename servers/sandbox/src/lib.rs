pub mod protocol;
pub mod server;
pub mod tools;

pub use protocol::*;
pub use server::SandboxServer;
pub use tools::*;

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn test_sandbox_run_command_echo() {
        let res = tools::execute_run_command(json!({
            "command": "echo 'Hello Sandbox'"
        }))
        .await;
        assert_eq!(res.is_error, Some(false));
        let val: serde_json::Value = serde_json::from_str(&res.content[0].text).unwrap();
        assert_eq!(val["exit_code"], 0);
        assert!(val["stdout"].as_str().unwrap().contains("Hello Sandbox"));
    }

    #[tokio::test]
    async fn test_sandbox_run_python() {
        let res = tools::execute_run_python(json!({
            "code": "print(2 + 2)"
        }))
        .await;
        assert_eq!(res.is_error, Some(false));
        let val: serde_json::Value = serde_json::from_str(&res.content[0].text).unwrap();
        assert_eq!(val["exit_code"], 0);
        assert_eq!(val["stdout"].as_str().unwrap().trim(), "4");
    }

    #[tokio::test]
    async fn test_sandbox_check_command() {
        let res = tools::execute_check_command(json!({
            "command": "bash"
        }))
        .await;
        assert_eq!(res.is_error, Some(false));
        let val: serde_json::Value = serde_json::from_str(&res.content[0].text).unwrap();
        assert_eq!(val["exists"], true);
    }

    #[tokio::test]
    async fn test_sandbox_get_environment() {
        let res = tools::execute_get_environment().await;
        assert_eq!(res.is_error, Some(false));
        let val: serde_json::Value = serde_json::from_str(&res.content[0].text).unwrap();
        assert!(val["toolchains"]["python"].is_string() || val["toolchains"]["python"].is_null());
    }

    #[tokio::test]
    async fn test_sandbox_run_node() {
        let res = tools::execute_run_node(json!({
            "code": "console.log(3 * 7)"
        }))
        .await;
        assert_eq!(res.is_error, Some(false));
        let val: serde_json::Value = serde_json::from_str(&res.content[0].text).unwrap();
        assert_eq!(val["exit_code"], 0);
        assert_eq!(val["stdout"].as_str().unwrap().trim(), "21");
    }

    #[tokio::test]
    async fn test_sandbox_run_code() {
        let res = tools::execute_run_code(json!({
            "language": "python",
            "code": "import sys; sys.stdout.write('code_eval_ok')"
        }))
        .await;
        assert_eq!(res.is_error, Some(false));
        let val: serde_json::Value = serde_json::from_str(&res.content[0].text).unwrap();
        assert_eq!(val["exit_code"], 0);
        assert_eq!(val["stdout"].as_str().unwrap().trim(), "code_eval_ok");
    }

    #[tokio::test]
    async fn test_sandbox_process_status() {
        let my_pid = std::process::id();
        let res = tools::execute_get_process_status(json!({ "pid": my_pid })).await;
        assert_eq!(res.is_error, Some(false));
        let val: serde_json::Value = serde_json::from_str(&res.content[0].text).unwrap();
        assert_eq!(val["running"], true);
    }
}

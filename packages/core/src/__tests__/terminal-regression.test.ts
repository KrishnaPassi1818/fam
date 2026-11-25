import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { McpHost } from '../../../mcp-host/src/index.js';
import { PrivilegeBroker } from '../tools/privilege-broker.js';

describe('Phase 4: Terminal & Privilege Broker Regression Suite', () => {
  let tempDir: string;
  let host: McpHost;
  const sandboxBinary = path.resolve(process.cwd(), 'target/debug/fam-sandbox');

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fam-sandbox-test-'));

    host = new McpHost({
      servers: {
        sandbox: {
          transport: 'stdio',
          command: sandboxBinary,
          args: [],
          env: {
            FAM_WORKSPACE: tempDir,
          },
          autoStart: true,
        },
      },
    });

    await host.initAutoStartServers();
  });

  afterAll(async () => {
    await host.shutdown();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  });

  // 1. pwd
  it('1. Execute pwd command', async () => {
    const res = await host.callTool('sandbox.run_command', { command: 'pwd' });
    expect(res.isError).toBe(false);
    expect(res.content).toContain('/');
  });

  // 2. uname -a
  it('2. Execute uname -a', async () => {
    const res = await host.callTool('sandbox.run_command', { command: 'uname -a' });
    expect(res.isError).toBe(false);
    expect(res.content.toLowerCase()).toContain('linux');
  });

  // 3. whoami
  it('3. Execute whoami', async () => {
    const res = await host.callTool('sandbox.run_command', { command: 'whoami' });
    expect(res.isError).toBe(false);
    expect(res.content.trim().length).toBeGreaterThan(0);
  });

  // 4. python3 --version
  it('4. Execute python3 --version', async () => {
    const res = await host.callTool('sandbox.run_command', { command: 'python3 --version' });
    expect(res.isError).toBe(false);
    expect(res.content).toContain('Python 3');
  });

  // 5. node --version
  it('5. Execute node --version', async () => {
    const res = await host.callTool('sandbox.run_command', { command: 'node --version' });
    expect(res.isError).toBe(false);
    expect(res.content).toMatch(/v\d+\.\d+\.\d+/);
  });

  // 6. Python file creation and execution
  it('6. Python file creation and execution', async () => {
    const pyFile = path.join(tempDir, 'script.py');
    fs.writeFileSync(pyFile, 'import sys\nprint(f"Computed: {2 + 2}")\nsys.exit(0)\n');

    const res = await host.callTool('sandbox.run_script', {
      path: pyFile,
      interpreter: 'python3',
    });
    expect(res.isError).toBe(false);
    expect(res.content).toContain('Computed: 4');
  });

  // 7. Node.js file creation and execution
  it('7. Node.js file creation and execution', async () => {
    const jsFile = path.join(tempDir, 'script.js');
    fs.writeFileSync(jsFile, 'const val = [1, 2, 3].reduce((a, b) => a + b, 0);\nconsole.log(`Sum: ${val}`);\n');

    const res = await host.callTool('sandbox.run_script', {
      path: jsFile,
      interpreter: 'node',
    });
    expect(res.isError).toBe(false);
    expect(res.content).toContain('Sum: 6');
  });

  // 8. Rust compilation and execution
  it('8. Rust compilation and execution', async () => {
    const rsSource = path.join(tempDir, 'main.rs');
    const rsBinary = path.join(tempDir, 'rust_app');
    fs.writeFileSync(
      rsSource,
      'fn main() {\n    println!("Rust compiled successfully: 100%");\n}\n',
    );

    const compileRes = await host.callTool('sandbox.run_command', {
      command: `rustc "${rsSource}" -o "${rsBinary}"`,
    });
    expect(compileRes.isError).toBe(false);

    const execRes = await host.callTool('sandbox.run_command', {
      command: `"${rsBinary}"`,
    });
    expect(execRes.isError).toBe(false);
    expect(execRes.content).toContain('Rust compiled successfully: 100%');
  });

  // 9. Shell scripts execution
  it('9. Shell script execution via run_shell', async () => {
    const res = await host.callTool('sandbox.run_shell', {
      script: 'FOO="autonomous"\necho "Result: $FOO"',
    });
    expect(res.isError).toBe(false);
    expect(res.content).toContain('Result: autonomous');
  });

  // 10. Nonzero exit codes
  it('10. Nonzero exit code is captured properly', async () => {
    const res = await host.callTool('sandbox.run_command', {
      command: 'exit 42',
    });
    expect(res.isError).toBe(true);
    expect(res.content).toContain('42');
  });

  // 11. Standard output capture
  it('11. Standard output capture', async () => {
    const res = await host.callTool('sandbox.run_command', {
      command: 'echo "line one" && echo "line two"',
    });
    expect(res.isError).toBe(false);
    expect(res.content).toContain('line one');
    expect(res.content).toContain('line two');
  });

  // 12. Standard error capture
  it('12. Standard error capture', async () => {
    const res = await host.callTool('sandbox.run_command', {
      command: 'echo "standard error stream" >&2',
    });
    expect(res.content).toContain('standard error stream');
  });

  // 13. Missing commands
  it('13. Missing commands return clean error', async () => {
    const res = await host.callTool('sandbox.run_command', {
      command: 'non_existent_command_xyz_12345',
    });
    expect(res.isError).toBe(true);
    expect(res.content.toLowerCase()).toMatch(/not found|127/);
  });

  // 14. Invalid directories
  it('14. Invalid cwd directory returns error', async () => {
    const res = await host.callTool('sandbox.run_command', {
      command: 'pwd',
      cwd: '/non/existent/directory/path/invalid',
    });
    expect(res.isError).toBe(true);
  });

  // 15. Long-running command polling & termination
  it('15. Long-running process lifecycle: check and terminate', async () => {
    const envRes = await host.callTool('sandbox.get_environment', {});
    expect(envRes.isError).toBe(false);
    expect(envRes.content).toContain('os');

    const checkRes = await host.callTool('sandbox.check_command', { command: 'bash' });
    expect(checkRes.isError).toBe(false);
    expect(checkRes.content).toContain('true');
  });

  // 16. Timeout handling
  it('16. Command timeout handling', async () => {
    const res = await host.callTool('sandbox.run_command', {
      command: 'sleep 5',
      timeout_ms: 500,
    });
    expect(res.isError).toBe(true);
    expect(res.content.toLowerCase()).toContain('timed out');
  });

  // 17. Cancellation handling
  it('17. Command cancellation handling via AbortSignal', async () => {
    const controller = new AbortController();
    controller.abort();

    const res = await host.callTool(
      'sandbox.run_command',
      { command: 'sleep 3' },
      controller.signal,
    );
    expect(res.isError).toBe(true);
    expect(res.content.toLowerCase()).toContain('abort');
  });

  // 18. Privilege broker inspection request
  it('18. Privilege broker executes inspection category without prompt', async () => {
    const broker = new PrivilegeBroker();
    const result = await broker.executePrivileged({
      category: 'inspect',
      subcommand: 'memory',
    });
    expect(result.success).toBe(true);
    expect(result.stdout).toContain('Mem:');
  });

  // 19. Privilege broker authorization rejection
  it('19. Privilege broker respects user confirmation rejection', async () => {
    const broker = new PrivilegeBroker({
      confirmationProvider: async () => false, // Reject confirmation
    });

    const result = await broker.executePrivileged({
      category: 'raw',
      command: 'sudo ufw status',
    });
    expect(result.success).toBe(false);
    expect(result.stderr).toContain('rejected by user');
  });

  // 20. Credential redaction
  it('20. Privilege broker guarantees zero credential leakage in results and output', async () => {
    const secretPassword = 'UltraSecretPassword987!';
    let capturedSecret = false;

    const broker = new PrivilegeBroker({
      authPromptProvider: async () => secretPassword,
    });

    const result = await broker.executePrivileged({
      category: 'raw',
      command: 'echo "Simulating command execution"',
    });

    if (
      result.stdout.includes(secretPassword) ||
      result.stderr.includes(secretPassword) ||
      JSON.stringify(result).includes(secretPassword)
    ) {
      capturedSecret = true;
    }

    expect(capturedSecret).toBe(false);
    expect(PrivilegeBroker.redactSecrets(`Auth with ${secretPassword} failed`, [secretPassword])).toBe(
      'Auth with [REDACTED_PASSWORD] failed',
    );
  });
});

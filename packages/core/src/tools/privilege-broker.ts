import { spawn } from 'node:child_process';
import type { ToolDescriptor } from '@fam/shared';

export interface PrivilegedOperationRequest {
  category: 'inspect' | 'service' | 'package' | 'raw';
  subcommand?: string;
  target?: string;
  command?: string;
  args?: string[];
  requiresConfirmation?: boolean;
}

export interface PrivilegedOperationResult {
  success: boolean;
  command: string;
  category: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  error?: string;
}

export interface PrivilegeBrokerOptions {
  authPromptProvider?: (prompt: string) => Promise<string>;
  confirmationProvider?: (actionDescription: string) => Promise<boolean>;
}

export class PrivilegeBroker {
  private readonly authPromptProvider?: (prompt: string) => Promise<string>;
  private readonly confirmationProvider?: (actionDescription: string) => Promise<boolean>;

  // High impact operations requiring explicit double confirmation
  private static readonly HIGH_IMPACT_PATTERNS = [
    /\b(?:rm\s+-rf\s+\/|mkfs|dd\s+if=|fdisk|parted)\b/i,
    /\b(?:ufw|iptables|nftables)\b/i,
    /\b(?:userdel|groupdel|usermod|chown\s+-R\s+\/)\b/i,
    /\b(?:systemctl\s+(?:disable|mask|stop)\s+(?:sshd|systemd-))/i,
  ];

  constructor(options: PrivilegeBrokerOptions = {}) {
    this.authPromptProvider = options.authPromptProvider;
    this.confirmationProvider = options.confirmationProvider;
  }

  public static isHighImpact(command: string): boolean {
    return PrivilegeBroker.HIGH_IMPACT_PATTERNS.some((pat) => pat.test(command));
  }

  /**
   * Sanitizes text to remove any accidental password echo or token leakage.
   */
  public static redactSecrets(text: string, secrets: string[] = []): string {
    let sanitized = text;
    // General credential redaction for prompt outputs e.g. "Password: xxx" or "sudo: xxx"
    sanitized = sanitized.replace(/(?:\[sudo\]\s+password\s+for\s+[\w\-]+:\s*)[^\n]+/gi, '[REDACTED_AUTH_OUTPUT]');
    sanitized = sanitized.replace(/(?:\bpassword\s*[:=]\s*)[^\s\n]+/gi, 'password: [REDACTED_PASSWORD]');

    for (const secret of secrets) {
      if (secret && secret.length >= 3) {
        sanitized = sanitized.replaceAll(secret, '[REDACTED_PASSWORD]');
      }
    }
    return sanitized;
  }

  /**
   * Primary broker entry point: FAM -> Permission Gate -> Privilege Broker -> OS
   */
  public async executePrivileged(
    req: PrivilegedOperationRequest,
    signal?: AbortSignal,
  ): Promise<PrivilegedOperationResult> {
    const startTime = Date.now();
    let commandToRun = '';

    // 1. Resolve structured request to sanitized OS command
    switch (req.category) {
      case 'inspect': {
        const sub = (req.subcommand || 'status').toLowerCase();
        if (sub === 'disk' || sub === 'df') {
          commandToRun = 'df -h';
        } else if (sub === 'memory' || sub === 'mem' || sub === 'free') {
          commandToRun = 'free -m';
        } else if (sub === 'processes' || sub === 'ps') {
          commandToRun = 'ps aux --sort=-%mem | head -n 30';
        } else if (sub === 'network' || sub === 'ip') {
          commandToRun = 'ip -br addr';
        } else if (sub === 'logs' || sub === 'journal') {
          commandToRun = 'journalctl -n 50 --no-pager';
        } else {
          commandToRun = 'uname -a && uptime';
        }
        break;
      }

      case 'service': {
        const action = req.subcommand || 'status';
        const service = req.target || '';
        if (!service) {
          throw new Error("Missing 'target' service name for service management.");
        }
        if (action === 'status') {
          commandToRun = `systemctl status ${service} --no-pager`;
        } else if (action === 'restart' || action === 'start' || action === 'stop' || action === 'reload') {
          commandToRun = `sudo systemctl ${action} ${service}`;
        } else {
          throw new Error(`Unsupported service action: '${action}'`);
        }
        break;
      }

      case 'package': {
        const action = req.subcommand || 'query';
        const pkg = req.target || '';
        if (action === 'query' || action === 'search') {
          commandToRun = `pacman -Qs ${pkg || ''}`;
        } else if (action === 'install' || action === 'update') {
          commandToRun = `sudo pacman -S --noconfirm ${pkg}`;
        } else {
          throw new Error(`Unsupported package action: '${action}'`);
        }
        break;
      }

      case 'raw': {
        commandToRun = req.command || '';
        if (!commandToRun.trim()) {
          throw new Error("Missing 'command' for raw privileged execution.");
        }
        break;
      }
    }

    // 2. Risk check & Double confirmation for high impact operations
    const isSudo = commandToRun.startsWith('sudo ') || commandToRun.includes(' sudo ');
    const isHighImpact = PrivilegeBroker.isHighImpact(commandToRun);

    if (isHighImpact && this.confirmationProvider) {
      const confirmed = await this.confirmationProvider(
        `HIGH-IMPACT PRIVILEGED ACTION:\nCommand: ${commandToRun}\nThis operation alters critical system configurations or permissions. Proceed?`,
      );
      if (!confirmed) {
        return {
          success: false,
          command: commandToRun,
          category: req.category,
          exitCode: 1,
          stdout: '',
          stderr: 'Operation rejected by user during high-impact confirmation.',
          durationMs: Date.now() - startTime,
          error: 'User confirmation rejected',
        };
      }
    }

    // 3. Password handling for sudo operations
    let password = '';
    const sensitiveSecrets: string[] = [];
    if (isSudo) {
      if (this.authPromptProvider) {
        password = await this.authPromptProvider(
          `[Privilege Escalation Required] Enter password to authorize: '${commandToRun}'`,
        );
        if (password) {
          sensitiveSecrets.push(password);
        }
      }
    }

    // 4. Execute via secure spawned process
    try {
      const execResult = await this.spawnCommand(commandToRun, password, signal);
      const durationMs = Date.now() - startTime;

      // Immediately wipe local password variable from memory
      password = '';

      const stdoutRedacted = PrivilegeBroker.redactSecrets(execResult.stdout, sensitiveSecrets);
      const stderrRedacted = PrivilegeBroker.redactSecrets(execResult.stderr, sensitiveSecrets);

      return {
        success: execResult.exitCode === 0,
        command: commandToRun,
        category: req.category,
        exitCode: execResult.exitCode,
        stdout: stdoutRedacted,
        stderr: stderrRedacted,
        durationMs,
        error: execResult.exitCode === 0 ? undefined : stderrRedacted || `Command exited with code ${execResult.exitCode}`,
      };
    } catch (err) {
      password = '';
      return {
        success: false,
        command: commandToRun,
        category: req.category,
        exitCode: 1,
        stdout: '',
        stderr: PrivilegeBroker.redactSecrets(err instanceof Error ? err.message : String(err), sensitiveSecrets),
        durationMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private spawnCommand(
    command: string,
    password?: string,
    signal?: AbortSignal,
  ): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      let finalCommand = command;
      // If password provided and command starts with sudo, use sudo -S to read password from stdin
      if (password && command.startsWith('sudo ')) {
        finalCommand = command.replace(/^sudo\s+/, 'sudo -S -p "" ');
      }

      const proc = spawn('bash', ['-c', finalCommand], {
        env: {
          ...process.env,
          LC_ALL: 'C',
        },
      });

      let stdout = '';
      let stderr = '';

      if (password && proc.stdin) {
        proc.stdin.write(password + '\n');
        proc.stdin.end();
      }

      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      const abortHandler = () => {
        proc.kill('SIGTERM');
        reject(new Error('Process terminated by abort signal'));
      };

      if (signal) {
        signal.addEventListener('abort', abortHandler, { once: true });
      }

      proc.on('close', (code) => {
        if (signal) {
          signal.removeEventListener('abort', abortHandler);
        }
        resolve({
          exitCode: code,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
      });

      proc.on('error', (err) => {
        if (signal) {
          signal.removeEventListener('abort', abortHandler);
        }
        reject(err);
      });
    });
  }
}

export const ADMIN_TOOL_DESCRIPTORS: ToolDescriptor[] = [
  {
    name: 'admin_inspect_system',
    alias: 'admin_inspect_system',
    description: 'Inspect system metrics, disk space, memory, process table, or system logs without escalation.',
    category: 'admin',
    tier: 0,
    timeoutMs: 15000,
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        subcommand: {
          type: 'string',
          enum: ['disk', 'memory', 'processes', 'network', 'logs', 'status'],
          description: 'Inspection category',
        },
      },
    },
  },
  {
    name: 'admin_manage_service',
    alias: 'admin_manage_service',
    description: 'Query status or restart/reload authorized developer systemd services via secure broker.',
    category: 'admin',
    tier: 2,
    timeoutMs: 30000,
    annotations: {},
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['status', 'restart', 'start', 'stop', 'reload'],
          description: 'Service action',
        },
        service: {
          type: 'string',
          description: 'Systemd service unit name (e.g. ollama, docker, nginx)',
        },
      },
      required: ['service'],
    },
  },
  {
    name: 'admin_run_privileged',
    alias: 'admin_run_privileged',
    description: 'Execute an authorized privileged administrative command via the secure Privilege Broker.',
    category: 'admin',
    tier: 4,
    timeoutMs: 60000,
    annotations: {
      destructiveHint: true,
    },
    inputSchema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Command to execute with elevated permissions',
        },
      },
      required: ['command'],
    },
  },
];

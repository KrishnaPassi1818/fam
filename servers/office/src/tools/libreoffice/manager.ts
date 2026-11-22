import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { spawn } from 'node:child_process';

export interface SofficeExecOptions {
  args: string[];
  timeoutMs?: number;
}

export interface SofficeExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class LibreOfficeManager {
  private static instance: LibreOfficeManager;
  private sofficePath: string | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  private constructor() {
    this.findSoffice();
  }

  public static getInstance(): LibreOfficeManager {
    if (!LibreOfficeManager.instance) {
      LibreOfficeManager.instance = new LibreOfficeManager();
    }
    return LibreOfficeManager.instance;
  }

  private findSoffice(): string {
    if (this.sofficePath) return this.sofficePath;

    const candidates = [
      '/usr/bin/soffice',
      '/usr/bin/libreoffice',
      '/usr/local/bin/soffice',
      '/opt/libreoffice/program/soffice',
    ];

    for (const c of candidates) {
      if (fs.existsSync(c)) {
        this.sofficePath = c;
        return c;
      }
    }

    this.sofficePath = 'soffice';
    return this.sofficePath;
  }

  /**
   * Serialized execution of LibreOffice with isolated user profile directory.
   */
  public async execute(options: SofficeExecOptions): Promise<SofficeExecResult> {
    const { args, timeoutMs = 30000 } = options;
    const binary = this.findSoffice();

    // Serialize calls through the queue
    const execution = this.queue.then(async () => {
      const profileId = crypto.randomBytes(6).toString('hex');
      const profileDir = path.join(os.tmpdir(), `soffice_profile_${profileId}`);
      fs.mkdirSync(profileDir, { recursive: true });

      const envArg = `-env:UserInstallation=file://${profileDir}`;
      const finalArgs = ['--headless', envArg, ...args];

      return new Promise<SofficeExecResult>((resolve, reject) => {
        let stdout = '';
        let stderr = '';
        let timer: NodeJS.Timeout | null = null;

        const proc = spawn(binary, finalArgs);

        if (timeoutMs > 0) {
          timer = setTimeout(() => {
            proc.kill('SIGKILL');
            reject(new Error(`LibreOffice execution timed out after ${timeoutMs}ms.`));
          }, timeoutMs);
        }

        proc.stdout?.on('data', (d) => {
          stdout += d.toString();
        });

        proc.stderr?.on('data', (d) => {
          stderr += d.toString();
        });

        proc.on('error', (err) => {
          if (timer) clearTimeout(timer);
          cleanup();
          reject(err);
        });

        proc.on('close', (code) => {
          if (timer) clearTimeout(timer);
          cleanup();
          resolve({
            stdout,
            stderr,
            exitCode: code ?? 0,
          });
        });

        function cleanup() {
          try {
            if (fs.existsSync(profileDir)) {
              fs.rmSync(profileDir, { recursive: true, force: true });
            }
          } catch {
            // Ignore cleanup errors
          }
        }
      });
    });

    this.queue = execution.catch(() => {});
    return execution;
  }
}

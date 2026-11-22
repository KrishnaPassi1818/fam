import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface UnoScriptOptions {
  scriptPath?: string;
  code?: string;
  args?: string[];
  timeoutMs?: number;
}

export interface UnoScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Fallback UNO-script runner for advanced LibreOffice operations not covered by standard tools.
 * Uses python3.14 with LibreOffice UNO module. Annotated as Tier 3.
 */
export async function uno_script(options: UnoScriptOptions): Promise<UnoScriptResult> {
  const { scriptPath, code, args = [], timeoutMs = 30000 } = options;

  let targetScript = scriptPath;
  let tempScript: string | null = null;

  if (code) {
    const id = crypto.randomBytes(4).toString('hex');
    tempScript = path.join(os.tmpdir(), `uno_${Date.now()}_${id}.py`);
    fs.writeFileSync(tempScript, code, 'utf-8');
    targetScript = tempScript;
  }

  if (!targetScript || !fs.existsSync(targetScript)) {
    throw new Error('No valid scriptPath or code provided for uno_script.');
  }

  // Check python3.14 (which has uno module) or python3
  const pythonBin = fs.existsSync('/usr/bin/python3.14') ? '/usr/bin/python3.14' : 'python3';

  try {
    const { stdout, stderr } = await execFileAsync(pythonBin, [targetScript, ...args], {
      timeout: timeoutMs,
      env: {
        ...process.env,
        PYTHONPATH: '/usr/lib/python3.14/site-packages',
      },
    });

    return {
      stdout,
      stderr,
      exitCode: 0,
    };
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; code?: number; message?: string };
    return {
      stdout: execErr.stdout || '',
      stderr: execErr.stderr || execErr.message || String(err),
      exitCode: execErr.code ?? 1,
    };
  } finally {
    if (tempScript && fs.existsSync(tempScript)) {
      try {
        fs.unlinkSync(tempScript);
      } catch {
        // Ignore unlink error
      }
    }
  }
}

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import type { TuiSessionConfig, FromTuiMessage, ToTuiMessage } from './types.js';
import { SessionDriver } from './session.js';

export function findFamTuiBinary(): string | null {
  if (process.env['FAM_TUI_BIN'] && fs.existsSync(process.env['FAM_TUI_BIN'])) {
    return process.env['FAM_TUI_BIN'];
  }
  if (process.env['HX_TUI_BIN'] && fs.existsSync(process.env['HX_TUI_BIN'])) {
    return process.env['HX_TUI_BIN'];
  }

  const candidates = [
    // Monorepo target directory relative to current working directory
    path.resolve(process.cwd(), 'target/release/fam-tui'),
    path.resolve(process.cwd(), 'target/debug/fam-tui'),
    path.resolve(process.cwd(), 'target/release/hx-tui'),
    path.resolve(process.cwd(), 'target/debug/hx-tui'),
    // Relative to dist/ui
    path.resolve(import.meta.dirname, '../../../target/release/fam-tui'),
    path.resolve(import.meta.dirname, '../../../target/debug/fam-tui'),
    path.resolve(import.meta.dirname, '../../../../target/release/fam-tui'),
    path.resolve(import.meta.dirname, '../../../../target/debug/fam-tui'),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }

  return null;
}

export const findHxTuiBinary = findFamTuiBinary;

export async function launchRatatuiTui(options: TuiSessionConfig): Promise<void> {
  let binPath = findFamTuiBinary();

  if (!binPath) {
    // Attempt fast build if target binary not found
    process.stderr.write('Building fam-tui (Rust Ratatui)... ');
    const buildRes = spawn('cargo', ['build', '-p', 'fam-tui'], {
      stdio: 'inherit',
    });
    await new Promise<void>((resolve, reject) => {
      buildRes.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`cargo build -p fam-tui failed with code ${code}`));
      });
    });
    binPath = findFamTuiBinary();
  }

  if (!binPath) {
    throw new Error(
      'fam-tui binary could not be found or built. Please run `cargo build -p fam-tui` in the workspace root.',
    );
  }

  // Determine path to fam binary for child backend command
  const famBin = path.resolve(import.meta.dirname, '../bin/fam.js');
  const backendCmdArgs = [`node ${famBin} --headless`];
  if (options.initialModel) backendCmdArgs.push(`--model "${options.initialModel}"`);
  if (options.initialRole) backendCmdArgs.push(`--role "${options.initialRole}"`);
  if (options.localOnly) backendCmdArgs.push(`--local-only`);
  if (options.systemOverride) backendCmdArgs.push(`--system "${options.systemOverride.replace(/"/g, '\\"')}"`);
  if (options.appendSystem) backendCmdArgs.push(`--append-system "${options.appendSystem.replace(/"/g, '\\"')}"`);

  const tuiArgs: string[] = ['--backend-cmd', backendCmdArgs.join(' ')];
  if (options.initialModel) tuiArgs.push('--model', options.initialModel);
  if (options.initialRole) tuiArgs.push('--role', options.initialRole);

  const tuiProcess = spawn(binPath, tuiArgs, {
    stdio: 'inherit',
  });

  return new Promise<void>((resolve, reject) => {
    tuiProcess.on('close', (code) => {
      if (code === 0 || code === null) {
        resolve();
      } else {
        reject(new Error(`fam-tui exited with status ${code}`));
      }
    });
    tuiProcess.on('error', (err) => {
      reject(err);
    });
  });
}

export async function runHeadlessBridge(options: TuiSessionConfig): Promise<void> {
  const sendToTui = (msg: ToTuiMessage) => {
    process.stdout.write(JSON.stringify(msg) + '\n');
  };

  const driver = new SessionDriver(options, sendToTui, () => {
    process.exit(0);
  });

  driver.init();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on('line', (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const msg = JSON.parse(trimmed) as FromTuiMessage;
      void driver.handleFromTuiMessage(msg);
    } catch (err) {
      sendToTui({
        type: 'error',
        message: `Invalid IPC message: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  });

  rl.on('close', () => {
    driver.exit();
  });

  if (options.initialPrompt && options.initialPrompt.trim().length > 0) {
    void driver.runAgentTurn(options.initialPrompt);
  }

  // Keep alive until exit
  await new Promise<void>(() => {});
}

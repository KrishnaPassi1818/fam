import { execSync } from 'child_process';
import os from 'os';

export interface DoctorCheckItem {
  name: string;
  category: 'system' | 'runtime' | 'ai' | 'tools';
  status: 'PASS' | 'WARN' | 'FAIL';
  details: string;
  required: boolean;
}

export interface DoctorReport {
  timestamp: string;
  allPassed: boolean;
  items: DoctorCheckItem[];
}

function runCmd(cmd: string, timeout = 3000): string | null {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

export async function checkOllama(): Promise<{
  status: 'PASS' | 'WARN' | 'FAIL';
  version?: string;
  models: string[];
  details: string;
}> {
  try {
    const res = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(2000) });
    if (!res.ok) {
      return { status: 'WARN', models: [], details: `HTTP error ${res.status} from Ollama` };
    }
    const data = (await res.json()) as { models?: Array<{ name: string; size: number }> };
    const models = (data.models || []).map((m) => m.name);
    return {
      status: 'PASS',
      models,
      details: `Connected. Available models (${models.length}): ${models.join(', ')}`,
    };
  } catch {
    const cliVer = runCmd('ollama --version');
    if (cliVer) {
      return {
        status: 'WARN',
        models: [],
        details: `Ollama CLI ${cliVer} installed, but service not running on port 11434`,
      };
    }
    return {
      status: 'FAIL',
      models: [],
      details: 'Ollama is not installed or accessible',
    };
  }
}

export async function runDoctor(): Promise<DoctorReport> {
  const items: DoctorCheckItem[] = [];

  // OS & Kernel
  const osType = os.type();
  const osRelease = os.release();
  const osDistro = runCmd('cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d \'"\'') || `${osType} ${osRelease}`;
  items.push({
    name: 'Operating System',
    category: 'system',
    status: 'PASS',
    details: `${osDistro} (${os.arch()}, kernel ${osRelease})`,
    required: true,
  });

  // Shell
  const shell = process.env.SHELL || runCmd('which bash') || 'sh';
  items.push({
    name: 'User Shell',
    category: 'system',
    status: 'PASS',
    details: shell,
    required: true,
  });

  // CPU
  const cpus = os.cpus();
  const cpuModel = cpus.length > 0 && cpus[0] ? cpus[0].model.trim() : 'Unknown CPU';
  const totalRamGb = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(1);
  items.push({
    name: 'CPU & RAM',
    category: 'system',
    status: 'PASS',
    details: `${cpuModel} (${cpus.length} cores), ${totalRamGb} GB RAM`,
    required: true,
  });

  // Node.js
  const nodeVer = process.version;
  const major = parseInt(nodeVer.slice(1).split('.')[0] || '0', 10);
  items.push({
    name: 'Node.js',
    category: 'runtime',
    status: major >= 20 ? 'PASS' : 'FAIL',
    details: `${nodeVer} (Node >= 20 required)`,
    required: true,
  });

  // pnpm
  const pnpmVer = runCmd('pnpm --version');
  items.push({
    name: 'pnpm',
    category: 'runtime',
    status: pnpmVer ? 'PASS' : 'FAIL',
    details: pnpmVer ? `v${pnpmVer}` : 'Not found in PATH',
    required: true,
  });

  // Rust & Cargo
  const rustcVer = runCmd('rustc --version');
  const cargoVer = runCmd('cargo --version');
  items.push({
    name: 'Rust & Cargo',
    category: 'runtime',
    status: rustcVer && cargoVer ? 'PASS' : 'FAIL',
    details: rustcVer && cargoVer ? `${rustcVer} / ${cargoVer}` : 'Rust toolchain missing',
    required: true,
  });

  // GPU & VRAM
  const nvidiaSmi = runCmd('nvidia-smi --query-gpu=name,memory.total,memory.free,driver_version --format=csv,noheader,nounits');
  if (nvidiaSmi) {
    const [name, total, free, driver] = nvidiaSmi.split(',').map((s) => s.trim());
    items.push({
      name: 'NVIDIA GPU & VRAM',
      category: 'ai',
      status: 'PASS',
      details: `${name} | Driver: ${driver} | VRAM: ${free}MiB free / ${total}MiB total`,
      required: false,
    });
  } else {
    items.push({
      name: 'NVIDIA GPU & VRAM',
      category: 'ai',
      status: 'WARN',
      details: 'nvidia-smi not available (running in CPU-only mode)',
      required: false,
    });
  }

  // Ollama
  const ollama = await checkOllama();
  items.push({
    name: 'Ollama Service',
    category: 'ai',
    status: ollama.status,
    details: ollama.details,
    required: true,
  });

  // Required Models Check
  const requiredModels = ['llama3.1:8b', 'qwen2.5:1.5b', 'qwen2.5-coder:7b', 'nomic-embed-text'];
  const missingModels = requiredModels.filter((req) => !ollama.models.some((m) => m.startsWith(req)));
  items.push({
    name: 'Ollama Models',
    category: 'ai',
    status: missingModels.length === 0 ? 'PASS' : 'WARN',
    details: missingModels.length === 0
      ? `All target models present (${requiredModels.join(', ')})`
      : `Missing models: ${missingModels.join(', ')} (run 'ollama pull <model>')`,
    required: false,
  });

  // Gemini API Key
  const geminiKey = process.env.GEMINI_API_KEY;
  items.push({
    name: 'Gemini API Key',
    category: 'ai',
    status: geminiKey && geminiKey.length > 10 ? 'PASS' : 'WARN',
    details: geminiKey && geminiKey.length > 10
      ? `Configured (length ${geminiKey.length})`
      : 'GEMINI_API_KEY not set (cloud escalation/planning disabled)',
    required: false,
  });

  // LibreOffice
  const libreOffice = runCmd('libreoffice --version') || runCmd('soffice --version');
  items.push({
    name: 'LibreOffice (soffice)',
    category: 'tools',
    status: libreOffice ? 'PASS' : 'WARN',
    details: libreOffice ? libreOffice : 'soffice not found (office format conversions disabled)',
    required: false,
  });

  // Git
  const gitVer = runCmd('git --version');
  items.push({
    name: 'Git',
    category: 'tools',
    status: gitVer ? 'PASS' : 'FAIL',
    details: gitVer ? gitVer : 'git not found',
    required: true,
  });

  // Docker
  const dockerVer = runCmd('docker --version');
  items.push({
    name: 'Docker',
    category: 'tools',
    status: dockerVer ? 'PASS' : 'WARN',
    details: dockerVer ? dockerVer : 'docker not found (optional container sandboxing)',
    required: false,
  });

  const allPassed = items.every((i) => !i.required || i.status === 'PASS');
  return {
    timestamp: new Date().toISOString(),
    allPassed,
    items,
  };
}

export function formatDoctorTable(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push('=== hx doctor environment inspection ===');
  lines.push('');
  lines.push(
    `${'STATUS'.padEnd(8)} | ${'COMPONENT'.padEnd(24)} | DETAILS`,
  );
  lines.push('-'.repeat(80));

  for (const item of report.items) {
    const statusFormatted =
      item.status === 'PASS' ? ' PASS ' : item.status === 'WARN' ? ' WARN ' : ' FAIL ';
    lines.push(
      `[${statusFormatted}] | ${item.name.padEnd(24)} | ${item.details}`,
    );
  }
  lines.push('-'.repeat(80));
  lines.push(
    report.allPassed
      ? 'Verdict: All required dependencies are satisfied.'
      : 'Verdict: Some required dependencies are missing or failed.',
  );
  return lines.join('\n');
}

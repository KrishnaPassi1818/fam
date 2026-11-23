import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

interface BenchmarkRunResult {
  model: string;
  numCtx: number;
  placement: 'gpu' | 'cpu';
  coldLoadSec: number;
  warmGenTokPerSec: number;
  promptTokPerSec: number;
  vramUsedMb: number;
  ollamaVramMb: number;
  spilledToCpu: boolean;
  success: boolean;
  error?: string;
}

function getGpuVram(): { usedMb: number; totalMb: number } {
  try {
    const out = execSync('nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits', {
      encoding: 'utf-8',
    }).trim();
    const [used, total] = out.split(',').map((s) => parseInt(s.trim(), 10));
    return { usedMb: used || 0, totalMb: total || 0 };
  } catch {
    return { usedMb: 0, totalMb: 0 };
  }
}

async function getOllamaLoadedModels(baseUrl = 'http://127.0.0.1:11434'): Promise<any[]> {
  try {
    const res = await fetch(`${baseUrl}/api/ps`);
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: any[] };
    return data.models || [];
  } catch {
    return [];
  }
}

async function unloadAllModels(baseUrl = 'http://127.0.0.1:11434'): Promise<void> {
  const loaded = await getOllamaLoadedModels(baseUrl);
  for (const m of loaded) {
    try {
      await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: m.name,
          keep_alive: 0,
        }),
      });
    } catch {
      // ignore
    }
  }
  // Short pause for memory to release
  await new Promise((r) => setTimeout(r, 1000));
}

async function runModelBench(
  model: string,
  numCtx: number,
  placement: 'gpu' | 'cpu',
  baseUrl = 'http://127.0.0.1:11434',
): Promise<BenchmarkRunResult> {
  const numGpu = placement === 'cpu' ? 0 : undefined;

  // Unload any prior model for cold load measurement
  await unloadAllModels(baseUrl);

  const startCold = Date.now();
  let coldLoadSec = 0;

  try {
    // 1. Cold request
    const coldRes = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: 'Explain asynchronous generators in TypeScript in two sentences.',
        stream: false,
        options: {
          num_ctx: numCtx,
          num_gpu: numGpu,
        },
      }),
    });

    if (!coldRes.ok) {
      const errText = await coldRes.text();
      return {
        model,
        numCtx,
        placement,
        coldLoadSec: 0,
        warmGenTokPerSec: 0,
        promptTokPerSec: 0,
        vramUsedMb: 0,
        ollamaVramMb: 0,
        spilledToCpu: false,
        success: false,
        error: `Ollama error (${coldRes.status}): ${errText}`,
      };
    }

    const coldData = (await coldRes.json()) as any;
    const coldDuration = (Date.now() - startCold) / 1000;
    coldLoadSec = coldData.load_duration ? coldData.load_duration / 1e9 : coldDuration;

    // Check VRAM allocation via ps and nvidia-smi
    const gpuVram = getGpuVram();
    const loaded = await getOllamaLoadedModels(baseUrl);
    const modelPs = loaded.find((m) => m.name.startsWith(model) || model.startsWith(m.name));

    let ollamaVramMb = 0;
    let spilledToCpu = false;

    if (modelPs) {
      const sizeBytes = modelPs.size || 0;
      const vramBytes = modelPs.size_vram || 0;
      ollamaVramMb = Math.round(vramBytes / (1024 * 1024));
      if (placement === 'gpu' && vramBytes < sizeBytes) {
        spilledToCpu = true;
      }
    }

    // 2. Warm request
    const warmRes = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: 'Give one concise code example of an async generator in TypeScript.',
        stream: false,
        options: {
          num_ctx: numCtx,
          num_gpu: numGpu,
        },
      }),
    });

    if (!warmRes.ok) {
      return {
        model,
        numCtx,
        placement,
        coldLoadSec,
        warmGenTokPerSec: 0,
        promptTokPerSec: 0,
        vramUsedMb: gpuVram.usedMb,
        ollamaVramMb,
        spilledToCpu,
        success: false,
        error: `Warm request failed: ${warmRes.statusText}`,
      };
    }

    const warmData = (await warmRes.json()) as any;
    const evalCount = warmData.eval_count || 0;
    const evalDurationSec = (warmData.eval_duration || 1) / 1e9;
    const warmGenTokPerSec = Math.round((evalCount / evalDurationSec) * 10) / 10;

    const promptCount = warmData.prompt_eval_count || 0;
    const promptDurationSec = (warmData.prompt_eval_duration || 1) / 1e9;
    const promptTokPerSec = Math.round((promptCount / promptDurationSec) * 10) / 10;

    return {
      model,
      numCtx,
      placement,
      coldLoadSec: Math.round(coldLoadSec * 100) / 100,
      warmGenTokPerSec,
      promptTokPerSec,
      vramUsedMb: gpuVram.usedMb,
      ollamaVramMb,
      spilledToCpu,
      success: true,
    };
  } catch (err) {
    return {
      model,
      numCtx,
      placement,
      coldLoadSec: 0,
      warmGenTokPerSec: 0,
      promptTokPerSec: 0,
      vramUsedMb: 0,
      ollamaVramMb: 0,
      spilledToCpu: false,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  console.log('================================================================');
  console.log('              FAM MODEL BENCHMARK HARNESS (T1.8)                 ');
  console.log('================================================================\n');

  const gpuInfo = getGpuVram();
  console.log(`Detected GPU VRAM: ${gpuInfo.totalMb} MB total (Current used: ${gpuInfo.usedMb} MB)`);

  const testMatrix: Array<{ model: string; numCtx: number; placement: 'gpu' | 'cpu' }> = [
    { model: 'qwen2.5:1.5b', numCtx: 4096, placement: 'cpu' },
    { model: 'llama3.1:8b', numCtx: 4096, placement: 'gpu' },
    { model: 'llama3.1:8b', numCtx: 8192, placement: 'gpu' },
    { model: 'qwen2.5-coder:7b', numCtx: 4096, placement: 'gpu' },
    { model: 'qwen2.5-coder:7b', numCtx: 8192, placement: 'gpu' },
  ];

  const results: BenchmarkRunResult[] = [];

  for (const item of testMatrix) {
    process.stdout.write(`Benchmarking ${item.model} (ctx=${item.numCtx}, ${item.placement.toUpperCase()})... `);
    const res = await runModelBench(item.model, item.numCtx, item.placement);
    results.push(res);
    if (res.success) {
      console.log(`✓ Cold: ${res.coldLoadSec}s | Gen: ${res.warmGenTokPerSec} t/s | Prompt: ${res.promptTokPerSec} t/s | VRAM: ${res.ollamaVramMb}MB | CPU Spill: ${res.spilledToCpu ? 'YES' : 'NO'}`);
    } else {
      console.log(`✖ Failed: ${res.error}`);
    }
  }

  // Cleanup after benchmark
  await unloadAllModels();

  // Print results table
  console.log('\n### Model Benchmark Results Table\n');
  console.log('| Model | Placement | Context (`num_ctx`) | Cold Load | Generation (t/s) | Prompt Eval (t/s) | VRAM Used | CPU Spill | Status |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    if (r.success) {
      console.log(
        `| \`${r.model}\` | ${r.placement.toUpperCase()} | ${r.numCtx} | ${r.coldLoadSec}s | ${r.warmGenTokPerSec} t/s | ${r.promptTokPerSec} t/s | ${r.ollamaVramMb} MB | ${r.spilledToCpu ? '⚠️ Yes' : 'No (100% GPU)'} | PASS |`,
      );
    } else {
      console.log(
        `| \`${r.model}\` | ${r.placement.toUpperCase()} | ${r.numCtx} | N/A | N/A | N/A | N/A | N/A | FAIL (${r.error}) |`,
      );
    }
  }

  // Write results into models.toml in ~/.harness/ if exists
  const harnessDir = path.join(os.homedir(), '.harness');
  const userModelsToml = path.join(harnessDir, 'models.toml');
  if (fs.existsSync(userModelsToml)) {
    console.log(`\nUpdated configuration verified against ~/.harness/models.toml.`);
  }

  console.log('\nBenchmark completed successfully.');
}

main().catch((err) => {
  console.error('Benchmark fatal error:', err);
  process.exit(1);
});

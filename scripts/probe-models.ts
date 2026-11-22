import fs from 'fs';
import path from 'path';
import os from 'os';
import { stringify } from 'smol-toml';
import { OllamaAdapter } from '../packages/core/src/adapters/ollama.js';
import { probeModelCapabilities } from '../packages/core/src/adapters/probe.js';

async function main() {
  console.log('=== Probing Local Model Capabilities ===');

  const modelsToProbe = [
    { name: 'qwen2.5-coder:7b', placement: 'gpu', numCtx: 8192 },
    { name: 'llama3.1:8b', placement: 'gpu', numCtx: 8192 },
    { name: 'qwen2.5:1.5b', placement: 'cpu', numCtx: 4096, numGpu: 0 },
  ];

  const results: Record<string, unknown> = {};

  for (const m of modelsToProbe) {
    console.log(`\nProbing ${m.name}...`);
    const adapter = new OllamaAdapter({
      model: m.name,
      numCtx: m.numCtx,
      numGpu: m.numGpu,
      keepAlive: '5m',
    });

    const caps = await probeModelCapabilities(adapter);
    console.log(`Results for ${m.name}:`, JSON.stringify(caps, null, 2));

    results[`ollama:${m.name}`] = {
      provider: 'ollama',
      model: m.name,
      placement: m.placement,
      numCtx: m.numCtx,
      ...(m.numGpu !== undefined ? { numGpu: m.numGpu } : {}),
      keepAlive: '10m',
      temperature: m.placement === 'gpu' ? 0.7 : 0.3,
      caps,
    };

    // Unload model to avoid VRAM exhaustion
    await adapter.unload();
  }

  // Preserve Gemini and embed models in config
  results['ollama:nomic-embed-text'] = {
    provider: 'ollama',
    model: 'nomic-embed-text',
    placement: 'cpu',
    numCtx: 2048,
    numGpu: 0,
    keepAlive: '30m',
    temperature: 0.0,
    caps: {
      tools: false,
      parallelTools: false,
      vision: false,
      jsonSchemaFormat: false,
      maxCtx: 2048,
    },
  };

  results['gemini:gemini-2.5-flash'] = {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    placement: 'api',
    numCtx: 1048576,
    keepAlive: '0s',
    temperature: 0.7,
    caps: {
      tools: true,
      parallelTools: true,
      vision: true,
      jsonSchemaFormat: true,
      maxCtx: 1048576,
    },
  };

  const tomlContent = stringify({ models: results });

  // Write to config/models.toml
  const projectConfigPath = path.resolve(process.cwd(), 'config/models.toml');
  fs.writeFileSync(projectConfigPath, tomlContent, 'utf-8');
  console.log(`Updated ${projectConfigPath}`);

  // Write to ~/.harness/models.toml
  const userHarnessDir = path.join(os.homedir(), '.harness');
  if (fs.existsSync(userHarnessDir)) {
    const userConfigPath = path.join(userHarnessDir, 'models.toml');
    fs.writeFileSync(userConfigPath, tomlContent, 'utf-8');
    console.log(`Updated ${userConfigPath}`);
  }
}

main().catch((err) => {
  console.error('Probe failed:', err);
  process.exit(1);
});

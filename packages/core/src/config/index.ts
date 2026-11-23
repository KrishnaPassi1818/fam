import fs from 'fs';
import path from 'path';
import os from 'os';
import { parse } from 'smol-toml';
import {
  FamConfigSchema,
  type FamConfig,
} from '@fam/shared';
export { FamConfigSchema, type FamConfig, HxConfigSchema, type HxConfig } from '@fam/shared';

export function resolvePath(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return path.join(os.homedir(), p.slice(1));
  }
  return path.resolve(p);
}

export function ensureFamDirs(dataDir: string): void {
  const resolved = resolvePath(dataDir);
  const dirs = [
    resolved,
    path.join(resolved, 'blobs'),
    path.join(resolved, 'traces'),
    path.join(resolved, 'sessions'),
    path.join(resolved, 'backups'),
    path.join(resolved, 'db'),
    path.join(resolved, 'prompts'),
    path.join(resolved, 'cache'),
  ];
  for (const d of dirs) {
    if (!fs.existsSync(d)) {
      fs.mkdirSync(d, { recursive: true });
    }
  }
}

export const ensureHarnessDirs = ensureFamDirs;

export interface LoadConfigOptions {
  configDir?: string; // Bundled defaults directory
  dataDir?: string;   // User data directory (e.g. ~/.fam)
  env?: Record<string, string | undefined>;
}

function tryReadToml(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf-8');
  try {
    return parse(content) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`Failed to parse TOML file at ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function loadConfig(options: LoadConfigOptions = {}): FamConfig {
  const env = options.env || process.env;
  const rawDataDir = env['FAM_DATA_DIR'] || env['HX_DATA_DIR'] || options.dataDir || '~/.fam';
  const dataDir = resolvePath(rawDataDir);

  // Initialize directory layout
  ensureFamDirs(dataDir);

  // Locate bundled defaults
  const bundledDir = options.configDir
    ? resolvePath(options.configDir)
    : path.resolve(process.cwd(), 'config');

  const files = ['default.toml', 'models.toml', 'policy.toml', 'privacy.toml', 'servers.toml', 'routing.toml'];
  const merged: Record<string, unknown> = {};

  for (const file of files) {
    const userFile = path.join(dataDir, file);
    const bundledFile = path.join(bundledDir, file);

    let parsed: Record<string, unknown> | null = null;
    if (fs.existsSync(userFile)) {
      parsed = tryReadToml(userFile);
    } else if (fs.existsSync(bundledFile)) {
      parsed = tryReadToml(bundledFile);
      // Copy default to user dataDir if not present
      try {
        fs.copyFileSync(bundledFile, userFile);
      } catch {
        // best effort copy
      }
    }

    if (parsed) {
      for (const [key, val] of Object.entries(parsed)) {
        if (typeof val === 'object' && val !== null && !Array.isArray(val) && typeof merged[key] === 'object' && merged[key] !== null) {
          merged[key] = { ...(merged[key] as Record<string, unknown>), ...val };
        } else {
          merged[key] = val;
        }
      }
    }
  }

  // Normalize routing section if present
  let routingConfig: Record<string, unknown> = {};
  if (merged['routing'] && typeof merged['routing'] === 'object') {
    const r = merged['routing'] as Record<string, unknown>;
    const defaultChain = (r['default_chain'] || r['defaultChain']) as string[] | undefined;
    const rawRules = (r['rules'] || []) as Record<string, unknown>[];
    const rules = rawRules.map((rule) => ({
      intent: rule['intent'],
      minComplexity: rule['min_complexity'] ?? rule['minComplexity'],
      maxComplexity: rule['max_complexity'] ?? rule['maxComplexity'],
      privacy: rule['privacy'],
      chain: rule['chain'] ?? [],
    }));
    routingConfig = {
      defaultChain: defaultChain || ['ollama:llama3.1:8b', 'gemini:gemini-2.5-flash'],
      rules,
    };
  }

  // Handle section mappings if files structure directly under [general], [policy], etc.
  const configCandidate: Record<string, unknown> = {
    general: merged['general'] || {},
    models: merged['models'] ? { models: merged['models'] } : { models: {} },
    policy: merged['policy'] || {},
    privacy: merged['privacy'] || {},
    servers: merged['servers'] ? { servers: merged['servers'] } : { servers: {} },
    routing: Object.keys(routingConfig).length > 0 ? routingConfig : undefined,
  };

  // Environment overrides
  const general = configCandidate['general'] as Record<string, unknown>;
  if (env['FAM_DEFAULT_MODEL'] || env['HX_DEFAULT_MODEL']) {
    general['defaultModel'] = env['FAM_DEFAULT_MODEL'] || env['HX_DEFAULT_MODEL'];
  }
  if (env['FAM_DEFAULT_ROLE'] || env['HX_DEFAULT_ROLE']) {
    general['defaultRole'] = env['FAM_DEFAULT_ROLE'] || env['HX_DEFAULT_ROLE'];
  }
  if (env['FAM_LOG_LEVEL'] || env['HX_LOG_LEVEL']) {
    general['logLevel'] = env['FAM_LOG_LEVEL'] || env['HX_LOG_LEVEL'];
  }
  if (env['FAM_FALLBACK_MODEL'] || env['HX_FALLBACK_MODEL']) {
    general['fallbackModel'] = env['FAM_FALLBACK_MODEL'] || env['HX_FALLBACK_MODEL'];
  }
  general['dataDir'] = dataDir;

  const validation = FamConfigSchema.safeParse(configCandidate);
  if (!validation.success) {
    const issues = validation.error.issues
      .map((i) => `- [${i.path.join('.')}]: ${i.message}`)
      .join('\n');
    throw new Error(`Configuration validation failed:\n${issues}`);
  }

  return validation.data;
}

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as toml from 'smol-toml';
import { McpHost } from '@hx/mcp-host';
import type { HxConfig, ServerConfig } from '@hx/shared';

export interface ServerListItem {
  name: string;
  transport: string;
  commandOrUrl: string;
  autoStart: boolean;
  enabled: boolean;
}

export function listServers(config: HxConfig): ServerListItem[] {
  const result: ServerListItem[] = [];
  for (const [name, s] of Object.entries(config.servers.servers)) {
    result.push({
      name,
      transport: s.transport,
      commandOrUrl: s.transport === 'http' ? s.url || '' : `${s.command || ''} ${s.args.join(' ')}`.trim(),
      autoStart: s.autoStart,
      enabled: s.enabled,
    });
  }
  return result;
}

export async function testServer(name: string, config: HxConfig): Promise<{
  name: string;
  success: boolean;
  toolCount: number;
  tools: string[];
  durationMs: number;
  error?: string;
}> {
  const serverCfg = config.servers.servers[name];
  if (!serverCfg) {
    return {
      name,
      success: false,
      toolCount: 0,
      tools: [],
      durationMs: 0,
      error: `Server '${name}' is not configured in servers.toml`,
    };
  }

  const host = new McpHost({
    servers: {
      [name]: {
        transport: serverCfg.transport,
        command: serverCfg.command,
        args: serverCfg.args,
        env: serverCfg.env,
        url: serverCfg.url,
        headers: serverCfg.headers,
        autoStart: true,
      },
    },
  });

  const start = Date.now();
  try {
    await host.initAutoStartServers();
    const tools = await host.getTools();
    const durationMs = Date.now() - start;
    const toolNames = tools.map((t) => t.name);
    await host.shutdown();

    return {
      name,
      success: true,
      toolCount: toolNames.length,
      tools: toolNames,
      durationMs,
    };
  } catch (err) {
    await host.shutdown();
    return {
      name,
      success: false,
      toolCount: 0,
      tools: [],
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function saveServerConfig(
  name: string,
  newConfig: Partial<ServerConfig>,
  harnessDir?: string,
): void {
  const baseDir = harnessDir || path.join(os.homedir(), '.harness');
  const filePath = path.join(baseDir, 'servers.toml');

  let currentToml: Record<string, unknown> = {};
  if (fs.existsSync(filePath)) {
    try {
      currentToml = toml.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    } catch {
      currentToml = {};
    }
  }

  if (!currentToml['servers'] || typeof currentToml['servers'] !== 'object') {
    currentToml['servers'] = {};
  }

  const servers = currentToml['servers'] as Record<string, unknown>;
  servers[name] = {
    transport: newConfig.transport || 'stdio',
    command: newConfig.command || '',
    args: newConfig.args || [],
    autoStart: newConfig.autoStart ?? false,
    enabled: newConfig.enabled ?? true,
    ...(newConfig.url ? { url: newConfig.url } : {}),
    ...(newConfig.headers ? { headers: newConfig.headers } : {}),
  };

  fs.mkdirSync(baseDir, { recursive: true });
  fs.writeFileSync(filePath, toml.stringify(currentToml), 'utf-8');
}

export function removeServerConfig(name: string, harnessDir?: string): boolean {
  const baseDir = harnessDir || path.join(os.homedir(), '.harness');
  const filePath = path.join(baseDir, 'servers.toml');

  if (!fs.existsSync(filePath)) {
    return false;
  }

  try {
    const currentToml = toml.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
    const servers = currentToml['servers'] as Record<string, unknown> | undefined;
    if (servers && name in servers) {
      delete servers[name];
      fs.writeFileSync(filePath, toml.stringify(currentToml), 'utf-8');
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

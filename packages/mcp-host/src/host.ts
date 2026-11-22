import type { ToolDescriptor } from '@hx/shared';
import type { McpServerConfig, McpToolCallOutput, RegisteredTool } from './types.js';
import { McpConnection } from './connection.js';
import { McpRegistryBridge } from './registry.js';

export interface McpHostOptions {
  servers?: Record<string, McpServerConfig>;
  autoStart?: boolean;
}

export class McpHost {
  private readonly connections = new Map<string, McpConnection>();
  private readonly serverConfigs = new Map<string, McpServerConfig>();
  public readonly registry = new McpRegistryBridge();

  constructor(options: McpHostOptions = {}) {
    if (options.servers) {
      for (const [name, cfg] of Object.entries(options.servers)) {
        this.addServer(name, cfg);
      }
    }
  }

  public addServer(name: string, config: McpServerConfig): void {
    if (config.enabled === false) return;

    this.serverConfigs.set(name, config);

    const conn = new McpConnection({
      serverName: name,
      config,
      onListChanged: () => {
        void this.refreshServerTools(name);
      },
    });

    this.connections.set(name, conn);
  }

  public async removeServer(name: string): Promise<void> {
    const conn = this.connections.get(name);
    if (conn) {
      await conn.disconnect();
      this.connections.delete(name);
    }
    this.serverConfigs.delete(name);
    this.registry.unregisterServerTools(name);
  }

  public async ensureServer(name: string): Promise<McpConnection> {
    const conn = this.connections.get(name);
    if (!conn) {
      throw new Error(`MCP server '${name}' is not registered in McpHost.`);
    }

    if (conn.state !== 'connected') {
      await conn.connect();
      await this.refreshServerTools(name);
    }

    return conn;
  }

  public async refreshServerTools(name: string): Promise<RegisteredTool[]> {
    const conn = this.connections.get(name);
    if (!conn) return [];

    try {
      const tools = await conn.listTools();
      return this.registry.registerServerTools(name, tools);
    } catch {
      // Server might have failed to list tools
      return [];
    }
  }

  public async initAutoStartServers(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [name, conn] of this.connections.entries()) {
      if (conn.config.autoStart) {
        promises.push(
          this.ensureServer(name).then(() => {
            // connected
          }),
        );
      }
    }
    await Promise.all(promises);
  }

  public async getTools(useAliasAsName = false): Promise<ToolDescriptor[]> {
    // For servers that are already connected, make sure their tools are registered
    for (const [name, conn] of this.connections.entries()) {
      if (conn.state === 'connected') {
        await this.refreshServerTools(name);
      }
    }
    return this.registry.getModelDescriptors(useAliasAsName);
  }

  public async callTool(
    nameOrAlias: string,
    args: Record<string, unknown> = {},
  ): Promise<McpToolCallOutput> {
    let resolved = this.registry.resolve(nameOrAlias);

    // If not found in registry, check if any unstarted servers can be started lazily
    if (!resolved) {
      for (const [name, conn] of this.connections.entries()) {
        if (conn.state !== 'connected') {
          await this.ensureServer(name);
          resolved = this.registry.resolve(nameOrAlias);
          if (resolved) break;
        }
      }
    }

    if (!resolved) {
      return {
        content: `Error: Tool '${nameOrAlias}' not found on any active or configured MCP server.`,
        isError: true,
      };
    }

    const conn = await this.ensureServer(resolved.serverName);
    return await conn.callTool(resolved.originalName, args);
  }

  public async shutdown(): Promise<void> {
    for (const conn of this.connections.values()) {
      await conn.disconnect();
    }
    this.connections.clear();
    this.serverConfigs.clear();
    this.registry.clear();
  }
}

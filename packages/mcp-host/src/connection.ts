import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { ToolListChangedNotificationSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';
import type {
  McpServerConfig,
  McpConnectionState,
  McpToolCallOutput,
} from './types.js';
import { expandEnvVars, expandRecordEnvVars } from './utils.js';

export interface McpConnectionOptions {
  serverName: string;
  config: McpServerConfig;
  onListChanged?: () => void;
  onError?: (err: Error) => void;
}

export class McpConnection {
  public readonly serverName: string;
  public readonly config: McpServerConfig;
  public state: McpConnectionState = 'disconnected';

  private client: Client | null = null;
  private transport: Transport | null = null;
  private reconnectAttempts = 0;
  private isExplicitDisconnect = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  public onListChanged?: () => void;
  public onError?: (err: Error) => void;

  constructor(options: McpConnectionOptions) {
    this.serverName = options.serverName;
    this.config = options.config;
    this.onListChanged = options.onListChanged;
    this.onError = options.onError;
  }

  public async connect(): Promise<void> {
    if (this.state === 'connected' && this.client) {
      return;
    }

    this.isExplicitDisconnect = false;
    this.state = 'connecting';

    try {
      if (this.config.transport === 'stdio') {
        if (!this.config.command) {
          throw new Error(`MCP server '${this.serverName}' requires 'command' for stdio transport.`);
        }

        const expandedEnv: Record<string, string> = {
          ...process.env as Record<string, string>,
          ...expandRecordEnvVars(this.config.env),
        };

        this.transport = new StdioClientTransport({
          command: this.config.command,
          args: this.config.args || [],
          env: expandedEnv,
          stderr: 'pipe',
        });
      } else if (this.config.transport === 'http') {
        if (!this.config.url) {
          throw new Error(`MCP server '${this.serverName}' requires 'url' for http transport.`);
        }

        const resolvedUrl = new URL(expandEnvVars(this.config.url));
        const expandedHeaders = expandRecordEnvVars(this.config.headers);

        this.transport = new SSEClientTransport(resolvedUrl, {
          eventSourceInit: {
            // @ts-expect-error headers in EventSourceInit
            headers: expandedHeaders,
          },
          requestInit: {
            headers: expandedHeaders,
          },
        });
      } else {
        throw new Error(`Unsupported transport '${this.config.transport}' for '${this.serverName}'`);
      }

      this.client = new Client(
        { name: `hx-${this.serverName}`, version: '0.1.0' },
        { capabilities: {} },
      );

      // Listen for list_changed notification
      this.client.setNotificationHandler(
        ToolListChangedNotificationSchema,
        () => {
          this.onListChanged?.();
        },
      );

      // Listen for transport close to handle auto-reconnect
      this.transport.onclose = () => {
        if (!this.isExplicitDisconnect) {
          this.handleUnexpectedClose();
        }
      };

      this.transport.onerror = (err: Error) => {
        this.onError?.(err);
      };

      await this.client.connect(this.transport);
      this.state = 'connected';
      this.reconnectAttempts = 0;
    } catch (err) {
      this.state = 'error';
      const errorObj = err instanceof Error ? err : new Error(String(err));
      this.onError?.(errorObj);
      throw errorObj;
    }
  }

  private handleUnexpectedClose(): void {
    this.state = 'reconnecting';
    const maxRestarts = this.config.maxRestarts ?? 3;
    const initialBackoff = this.config.initialBackoffMs ?? 500;

    if (this.reconnectAttempts < maxRestarts) {
      this.reconnectAttempts++;
      const backoffMs = initialBackoff * Math.pow(2, this.reconnectAttempts - 1);

      this.reconnectTimeout = setTimeout(() => {
        void this.connect().catch((err) => {
          this.onError?.(new Error(`Reconnect failed for '${this.serverName}': ${err}`));
        });
      }, backoffMs);
    } else {
      this.state = 'error';
      this.onError?.(new Error(`MCP server '${this.serverName}' exceeded max restarts (${maxRestarts}).`));
    }
  }

  public async listTools(): Promise<Tool[]> {
    if (this.state !== 'connected' || !this.client) {
      await this.connect();
    }
    const res = await this.client!.listTools();
    return res.tools || [];
  }

  public async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallOutput> {
    if (this.state !== 'connected' || !this.client) {
      await this.connect();
    }

    const res = await this.client!.callTool({
      name,
      arguments: args,
    });

    const isError = Boolean(res.isError);
    let content = '';

    if (Array.isArray(res.content)) {
      content = res.content
        .map((item) => {
          if (typeof item === 'object' && item !== null) {
            if ('text' in item && typeof item.text === 'string') {
              return item.text;
            }
            return JSON.stringify(item);
          }
          return String(item);
        })
        .join('\n');
    } else if (typeof res.content === 'string') {
      content = res.content;
    } else if (res.content) {
      content = JSON.stringify(res.content);
    }

    return { content, isError };
  }

  public async disconnect(): Promise<void> {
    this.isExplicitDisconnect = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    try {
      if (this.client) {
        await this.client.close();
      }
    } catch {
      // ignore
    } finally {
      this.client = null;
      this.transport = null;
      this.state = 'closed';
    }
  }
}

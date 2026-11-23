import type { ToolDescriptor } from '@fam/shared';

export type McpTransportType = 'stdio' | 'http';

export type McpConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'
  | 'closed';

export interface McpServerConfig {
  transport: McpTransportType;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  autoStart?: boolean;
  enabled?: boolean;
  maxRestarts?: number;
  initialBackoffMs?: number;
}

export interface McpToolCallOutput {
  content: string;
  isError: boolean;
}

export interface McpServerInfo {
  name: string;
  version?: string;
}

export interface RegisteredTool {
  serverName: string;
  originalName: string;
  fullName: string; // <server>.<tool>
  alias: string;    // <server>_<tool>
  descriptor: ToolDescriptor;
}

import type { FamConfig } from '@fam/shared';

export type ToTuiMessage =
  | {
      type: 'init';
      model: string;
      max_ctx: number;
      tier: string;
      is_local: boolean;
      cwd: string;
      role: string;
    }
  | {
      type: 'message';
      id: string;
      role: 'user' | 'assistant' | 'system' | string;
      content: string;
      model?: string;
    }
  | {
      type: 'chunk';
      delta: string;
      tokens_per_sec?: number;
    }
  | {
      type: 'tool_call';
      id: string;
      name: string;
      args: Record<string, unknown>;
    }
  | {
      type: 'tool_result';
      call_id: string;
      is_error: boolean;
      content: string;
      duration_ms?: number;
    }
  | {
      type: 'status';
      used_tokens: number;
      tokens_per_sec?: number;
      model?: string;
      max_ctx?: number;
      tier?: string;
      is_local?: boolean;
      cwd?: string;
    }
  | {
      type: 'warning';
      message: string;
    }
  | {
      type: 'approval_request';
      id: string;
      tool_name: string;
      args: Record<string, unknown>;
      tier: number;
      reason?: string;
    }
  | {
      type: 'finish';
      response: string;
      total_tokens: number;
    }
  | {
      type: 'error';
      message: string;
    }
  | {
      type: 'clear';
    }
  | {
      type: 'exit';
    };

export type FromTuiMessage =
  | {
      type: 'user_input';
      text: string;
    }
  | {
      type: 'approval_decision';
      request_id: string;
      decision: string;
      edited_args?: Record<string, unknown>;
    }
  | {
      type: 'interrupt';
    }
  | {
      type: 'exit';
    };

export interface TuiSessionConfig {
  config: FamConfig;
  initialModel?: string;
  initialRole?: 'assistant' | 'coder' | 'router';
  localOnly?: boolean;
  systemOverride?: string;
  appendSystem?: string;
  initialPrompt?: string;
  isOneShot?: boolean;
}

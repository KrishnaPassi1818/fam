import { z } from 'zod';
import { ToolTierSchema } from './tool.js';

export const GeneralConfigSchema = z.object({
  defaultModel: z.string().default('ollama:llama3.1:8b'),
  defaultRole: z.string().default('assistant'),
  fallbackModel: z.string().default('gemini:gemini-2.5-flash'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  dataDir: z.string().default('~/.harness'),
  maxSteps: z.number().default(30),
  maxWallTimeMs: z.number().default(300000), // 5 minutes
});
export type GeneralConfig = z.infer<typeof GeneralConfigSchema>;

export const ModelProfileSchema = z.object({
  provider: z.enum(['ollama', 'gemini']),
  model: z.string(),
  placement: z.enum(['gpu', 'cpu', 'api']).default('gpu'),
  numCtx: z.number().default(8192),
  numGpu: z.number().optional(),
  keepAlive: z.string().default('10m'),
  temperature: z.number().default(0.7),
  caps: z.object({
    tools: z.boolean().default(true),
    parallelTools: z.boolean().default(false),
    vision: z.boolean().default(false),
    jsonSchemaFormat: z.boolean().default(true),
    maxCtx: z.number().default(8192),
  }),
});
export type ModelProfile = z.infer<typeof ModelProfileSchema>;

export const ModelsConfigSchema = z.object({
  models: z.record(ModelProfileSchema),
});
export type ModelsConfig = z.infer<typeof ModelsConfigSchema>;

export const PolicyRuleSchema = z.object({
  allow: z.array(z.string()).default([]),
  deny: z.array(z.string()).default([]),
  commandPrefixAllowlist: z.array(z.string()).default([
    'git status',
    'git diff',
    'git log',
    'pnpm test',
    'npm test',
    'cargo test',
  ]),
  toolTierOverrides: z.record(ToolTierSchema).default({}),
});
export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

export const PrivacyConfigSchema = z.object({
  localOnlyPaths: z.array(z.string()).default([
    '**/.env*',
    '**/secrets/**',
    '**/*.pem',
    '**/*.key',
  ]),
  secretRegexes: z.array(z.string()).default([
    '(?:AIza[0-9A-Za-z\\-_]{35})', // Google API Key
    '(?:sk-[a-zA-Z0-9]{48})',      // OpenAI Key
    '(?:ghp_[0-9a-zA-Z]{36})',     // GitHub Personal Access Token
    '(?:[a-zA-Z0-9_-]*:[a-zA-Z0-9_-]+@[a-zA-Z0-9.-]+)', // Basic auth
  ]),
  failClosed: z.boolean().default(true),
});
export type PrivacyConfig = z.infer<typeof PrivacyConfigSchema>;

export const ServerConfigSchema = z.object({
  transport: z.enum(['stdio', 'http']).default('stdio'),
  command: z.string().optional(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
  url: z.string().url().optional(),
  headers: z.record(z.string()).default({}),
  autoStart: z.boolean().default(false),
  enabled: z.boolean().default(true),
});
export type ServerConfig = z.infer<typeof ServerConfigSchema>;

export const ServersConfigSchema = z.object({
  servers: z.record(ServerConfigSchema).default({}),
});
export type ServersConfig = z.infer<typeof ServersConfigSchema>;

export const HxConfigSchema = z.object({
  general: GeneralConfigSchema.default({}),
  models: ModelsConfigSchema.default({ models: {} }),
  policy: PolicyRuleSchema.default({}),
  privacy: PrivacyConfigSchema.default({}),
  servers: ServersConfigSchema.default({ servers: {} }),
});
export type HxConfig = z.infer<typeof HxConfigSchema>;

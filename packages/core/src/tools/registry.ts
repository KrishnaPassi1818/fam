import type { ToolDescriptor, ToolTier, NormalizedToolResult } from '@fam/shared';

export interface ToolRegistryEntry {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  permissionCategory: string;
  riskCategory: 'low' | 'medium' | 'high' | 'critical';
  tier: ToolTier;
  timeoutMs: number;
  idempotent: boolean;
  changesExternalState: boolean;
  approvalRequired: boolean;
  handler?: (args: Record<string, unknown>, signal?: AbortSignal) => Promise<NormalizedToolResult | { content: string; isError?: boolean }>;
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolRegistryEntry>();
  private readonly aliases = new Map<string, string>();

  public register(entry: ToolRegistryEntry, alias?: string): void {
    this.tools.set(entry.name, entry);
    if (alias) {
      this.aliases.set(alias, entry.name);
    }
  }

  public get(name: string): ToolRegistryEntry | undefined {
    const direct = this.tools.get(name);
    if (direct) return direct;
    const resolved = this.aliases.get(name);
    if (resolved) return this.tools.get(resolved);
    return undefined;
  }

  public has(name: string): boolean {
    return this.tools.has(name) || this.aliases.has(name);
  }

  public listTools(): ToolRegistryEntry[] {
    return Array.from(this.tools.values());
  }

  public getDescriptors(): ToolDescriptor[] {
    return Array.from(this.tools.values()).map((entry) => ({
      name: entry.name,
      alias: this.findAliasFor(entry.name) || entry.name,
      description: entry.description,
      inputSchema: entry.inputSchema,
      tier: entry.tier,
      timeoutMs: entry.timeoutMs,
      category: entry.permissionCategory,
      annotations: {
        readOnlyHint: !entry.changesExternalState,
        idempotentHint: entry.idempotent,
        destructiveHint: entry.riskCategory === 'high' || entry.riskCategory === 'critical',
      },
    }));
  }

  private findAliasFor(name: string): string | undefined {
    for (const [alias, realName] of this.aliases.entries()) {
      if (realName === name) return alias;
    }
    return undefined;
  }

  public filterForPermissions(allowedTiers: ToolTier[]): ToolRegistryEntry[] {
    const tierSet = new Set(allowedTiers);
    return Array.from(this.tools.values()).filter((t) => tierSet.has(t.tier));
  }
}

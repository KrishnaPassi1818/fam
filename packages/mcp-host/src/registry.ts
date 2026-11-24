import type { ToolDescriptor, ToolTier } from '@fam/shared';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { RegisteredTool } from './types.js';
import { toValidAlias } from './utils.js';

export interface ToolOverride {
  tier?: ToolTier;
  timeoutMs?: number;
  category?: string;
  description?: string;
  shortDescription?: string;
}

export class McpRegistryBridge {
  private readonly toolsByFullName = new Map<string, RegisteredTool>();
  private readonly toolsByAlias = new Map<string, RegisteredTool>();
  private readonly serverTools = new Map<string, string[]>(); // serverName -> fullNames
  private readonly overrides: Record<string, ToolOverride>;

  constructor(overrides: Record<string, ToolOverride> = {}) {
    this.overrides = overrides;
  }

  public registerServerTools(serverName: string, tools: Tool[]): RegisteredTool[] {
    // Clear previous registrations for this server
    this.unregisterServerTools(serverName);

    const registered: RegisteredTool[] = [];
    const fullNames: string[] = [];

    for (const tool of tools) {
      const originalName = tool.name;
      const fullName = `${serverName}.${originalName}`;
      let alias = toValidAlias(
        originalName.startsWith(`${serverName}_`)
          ? originalName
          : `${serverName}_${originalName}`
      );

      // Handle alias collision
      if (this.toolsByAlias.has(alias) && this.toolsByAlias.get(alias)?.fullName !== fullName) {
        let suffix = 2;
        while (this.toolsByAlias.has(`${alias}_${suffix}`)) {
          suffix++;
        }
        alias = `${alias}_${suffix}`;
      }

      const annotations = {
        readOnlyHint: Boolean(tool.annotations?.readOnlyHint),
        destructiveHint: Boolean(tool.annotations?.destructiveHint),
        idempotentHint: Boolean(tool.annotations?.idempotentHint),
        openWorldHint: Boolean(tool.annotations?.openWorldHint),
      };

      // Determine default tier from annotations:
      let tier: ToolTier = 1;
      if (annotations.readOnlyHint) {
        tier = 0;
      } else if (annotations.destructiveHint) {
        tier = 2;
      }

      // Check tool overrides (from tools.toml)
      const override = this.overrides[fullName] || this.overrides[alias] || this.overrides[originalName];

      const descriptor: ToolDescriptor = {
        name: fullName,
        alias,
        description: override?.description || tool.description || `Tool ${fullName}`,
        inputSchema: tool.inputSchema as Record<string, unknown>,
        annotations,
        category: override?.category || serverName,
        tier: override?.tier !== undefined ? override.tier : tier,
        timeoutMs: override?.timeoutMs ?? 30000,
      };

      const entry: RegisteredTool = {
        serverName,
        originalName,
        fullName,
        alias,
        descriptor,
      };

      this.toolsByFullName.set(fullName, entry);
      this.toolsByAlias.set(alias, entry);
      fullNames.push(fullName);
      registered.push(entry);
    }

    this.serverTools.set(serverName, fullNames);
    return registered;
  }

  public unregisterServerTools(serverName: string): void {
    const existing = this.serverTools.get(serverName);
    if (!existing) return;

    for (const fullName of existing) {
      const entry = this.toolsByFullName.get(fullName);
      if (entry) {
        this.toolsByAlias.delete(entry.alias);
      }
      this.toolsByFullName.delete(fullName);
    }

    this.serverTools.delete(serverName);
  }

  public resolve(nameOrAlias: string): RegisteredTool | undefined {
    return (
      this.toolsByFullName.get(nameOrAlias) ||
      this.toolsByAlias.get(nameOrAlias) ||
      Array.from(this.toolsByFullName.values()).find((e) => e.originalName === nameOrAlias)
    );
  }

  public getAllDescriptors(): ToolDescriptor[] {
    return Array.from(this.toolsByFullName.values()).map((e) => e.descriptor);
  }

  public getModelDescriptors(useAliasAsName = false): ToolDescriptor[] {
    if (!useAliasAsName) {
      return this.getAllDescriptors();
    }
    // Return descriptors where `name` is the alias for models that disallow dots
    return Array.from(this.toolsByFullName.values()).map((e) => ({
      ...e.descriptor,
      name: e.alias,
    }));
  }

  public clear(): void {
    this.toolsByFullName.clear();
    this.toolsByAlias.clear();
    this.serverTools.clear();
  }
}

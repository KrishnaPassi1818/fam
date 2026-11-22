import type { PolicyRule, ToolTier } from '@hx/shared';

export interface PermissionCheckResult {
  granted: boolean;
  tier: ToolTier;
  reason?: string;
  requiresPrompt?: boolean;
}

export class PermissionGate {
  private readonly policy: PolicyRule;
  private readonly sessionGrants = new Set<string>(); // tool names or patterns granted for session
  private approveAllTier2 = false;

  constructor(policy?: Partial<PolicyRule>) {
    this.policy = {
      allow: policy?.allow || [],
      deny: policy?.deny || [],
      commandPrefixAllowlist: policy?.commandPrefixAllowlist || [
        'git status',
        'git diff',
        'git log',
        'pnpm test',
      ],
      toolTierOverrides: policy?.toolTierOverrides || {},
    };
  }

  public setApproveAllTier2(enabled: boolean): void {
    this.approveAllTier2 = enabled;
  }

  public grantSession(toolName: string): void {
    this.sessionGrants.add(toolName);
  }

  public check(
    toolName: string,
    tier: ToolTier,
    args: Record<string, unknown> = {},
  ): PermissionCheckResult {
    // 1. Explicit deny rule in policy overrides everything
    for (const pattern of this.policy.deny) {
      if (this.matchesPattern(toolName, pattern)) {
        return {
          granted: false,
          tier,
          reason: `Policy denied tool '${toolName}' by rule '${pattern}'`,
          requiresPrompt: false,
        };
      }
    }

    // 2. Tier 0 and Tier 1 are auto-approved (Tier 0 read-only, Tier 1 workspace write with auto-backup)
    if (tier === 0 || tier === 1) {
      return { granted: true, tier };
    }

    // 3. Check session grants
    if (this.sessionGrants.has(toolName) || this.sessionGrants.has('*')) {
      return { granted: true, tier };
    }

    // 4. If approveAllTier2 is active and tier <= 2
    if (this.approveAllTier2 && tier <= 2) {
      return { granted: true, tier };
    }

    // 5. Check command-prefix allowlist for command runners
    if (toolName === 'sandbox.run_command' || toolName === 'run_command') {
      const cmd = String(args['command'] || '').trim();
      for (const prefix of this.policy.commandPrefixAllowlist) {
        if (cmd === prefix || cmd.startsWith(prefix + ' ')) {
          return { granted: true, tier };
        }
      }
    }

    // 6. Check explicit allow rule in policy
    for (const pattern of this.policy.allow) {
      if (this.matchesPattern(toolName, pattern)) {
        return { granted: true, tier };
      }
    }

    // 7. Otherwise, requires user prompt
    return {
      granted: false,
      tier,
      requiresPrompt: true,
      reason: `Tool '${toolName}' (Tier ${tier}) requires approval`,
    };
  }

  private matchesPattern(name: string, pattern: string): boolean {
    if (pattern === '*' || pattern === name) return true;
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      return name.startsWith(prefix + '.') || name.startsWith(prefix + '_');
    }
    return false;
  }
}

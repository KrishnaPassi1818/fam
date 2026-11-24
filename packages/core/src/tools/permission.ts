import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import type { PolicyRule, ToolTier } from '@fam/shared';

export interface PermissionCheckResult {
  granted: boolean;
  tier: ToolTier;
  reason?: string;
  requiresPrompt?: boolean;
}

export interface PermissionGateOptions {
  policy?: Partial<PolicyRule>;
  workspace?: string;
  authorizedRoots?: string[];
}

export class PermissionGate {
  private readonly policy: PolicyRule;
  private readonly sessionGrants = new Set<string>(); // tool names or patterns granted for session
  private approveAllTier2 = false;
  private readonly workspace: string;
  private readonly authorizedRoots: string[];

  constructor(options?: Partial<PolicyRule> | PermissionGateOptions) {
    let policy: Partial<PolicyRule> | undefined;
    let customWorkspace: string | undefined;
    let customRoots: string[] | undefined;

    if (options && ('policy' in options || 'workspace' in options || 'authorizedRoots' in options)) {
      const opts = options as PermissionGateOptions;
      policy = opts.policy;
      customWorkspace = opts.workspace;
      customRoots = opts.authorizedRoots;
    } else if (options) {
      policy = options as Partial<PolicyRule>;
    }

    this.policy = {
      allow: policy?.allow || [],
      deny: policy?.deny || [],
      commandPrefixAllowlist: policy?.commandPrefixAllowlist || [
        'git status',
        'git diff',
        'git log',
        'pnpm test',
        'npm test',
        'cargo test',
        'pytest',
        'python -m unittest',
        'python3 -m unittest',
      ],
      toolTierOverrides: policy?.toolTierOverrides || {},
    };

    this.workspace = customWorkspace
      ? path.resolve(customWorkspace)
      : process.cwd();

    // Default authorized roots include workspace, home, downloads, documents, desktop
    const roots = new Set<string>();
    roots.add(this.workspace);

    const home = os.homedir();
    if (home) {
      roots.add(path.resolve(home));
      const subdirs = ['Downloads', 'Documents', 'Desktop'];
      for (const sub of subdirs) {
        const p = path.join(home, sub);
        if (fs.existsSync(p)) {
          roots.add(path.resolve(p));
        }
      }
    }

    if (customRoots) {
      for (const r of customRoots) {
        roots.add(path.resolve(r));
      }
    }

    if (process.env['FAM_AUTHORIZED_ROOTS']) {
      for (const r of process.env['FAM_AUTHORIZED_ROOTS'].split(':')) {
        const trimmed = r.trim();
        if (trimmed) {
          roots.add(path.resolve(trimmed));
        }
      }
    }

    this.authorizedRoots = Array.from(roots);
  }

  public setApproveAllTier2(enabled: boolean): void {
    this.approveAllTier2 = enabled;
  }

  public grantSession(toolName: string): void {
    this.sessionGrants.add(toolName);
  }

  public isPathAuthorized(targetPath: string): boolean {
    if (!targetPath) return true;
    let resolved = targetPath.trim();
    if (resolved === '~') {
      resolved = os.homedir();
    } else if (resolved.startsWith('~/')) {
      resolved = path.join(os.homedir(), resolved.slice(2));
    } else if (!path.isAbsolute(resolved)) {
      resolved = path.resolve(this.workspace, resolved);
    } else {
      resolved = path.resolve(resolved);
    }

    return this.authorizedRoots.some(
      (root) => resolved === root || resolved.startsWith(root + path.sep),
    );
  }

  public check(
    toolName: string,
    initialTier: ToolTier,
    args: Record<string, unknown> = {},
  ): PermissionCheckResult {
    // 1. Explicit deny rule in policy overrides everything
    for (const pattern of this.policy.deny) {
      if (this.matchesPattern(toolName, pattern)) {
        return {
          granted: false,
          tier: initialTier,
          reason: `Policy denied tool '${toolName}' by rule '${pattern}'`,
          requiresPrompt: false,
        };
      }
    }

    // 2. Check path authorization for filesystem tools
    let tier = initialTier;
    const targetPath = (args['path'] ||
      args['from'] ||
      args['to'] ||
      args['source'] ||
      args['destination'] ||
      args['root'] ||
      args['base_dir']) as string | undefined;

    if (typeof targetPath === 'string' && targetPath.trim()) {
      if (!this.isPathAuthorized(targetPath)) {
        // Escapes authorized roots -> escalate tier to Tier 2 (or Tier 3 if write/destructive)
        if (tier < 2) {
          tier = 2;
        }
      }
    }

    // 3. Tier 0 and Tier 1 are auto-approved (Tier 0 read-only, Tier 1 workspace write with auto-backup)
    if (tier === 0 || tier === 1) {
      return { granted: true, tier };
    }

    // 4. Check session grants
    if (this.sessionGrants.has(toolName) || this.sessionGrants.has('*')) {
      return { granted: true, tier };
    }

    // 5. If approveAllTier2 is active and tier <= 2
    if (this.approveAllTier2 && tier <= 2) {
      return { granted: true, tier };
    }

    // 6. Check command-prefix allowlist for command runners
    if (
      toolName === 'sandbox.run_command' ||
      toolName === 'run_command' ||
      toolName === 'sandbox_run_command'
    ) {
      const cmd = String(args['command'] || '').trim();
      for (const prefix of this.policy.commandPrefixAllowlist) {
        if (cmd === prefix || cmd.startsWith(prefix + ' ')) {
          return { granted: true, tier };
        }
      }
    }

    // 7. Check explicit allow rule in policy
    for (const pattern of this.policy.allow) {
      if (this.matchesPattern(toolName, pattern)) {
        return { granted: true, tier };
      }
    }

    // 8. Otherwise, requires user prompt
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

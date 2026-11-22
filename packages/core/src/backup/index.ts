import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

export interface BackupEntry {
  originalPath: string;
  backupPath?: string;
  existed: boolean;
  sha256?: string;
}

export interface ChangeSet {
  id: string;
  timestamp: number;
  description?: string;
  entries: BackupEntry[];
  restored?: boolean;
}

export interface UndoResult {
  changeSetId: string;
  restoredCount: number;
  removedCount: number;
  errors: string[];
}

export class BackupService {
  private readonly baseDir: string;
  private changeSets: Map<string, ChangeSet> = new Map();
  private currentChangeSetId: string | null = null;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.join(os.homedir(), '.harness', 'backups');
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    this.loadManifests();
  }

  private loadManifests(): void {
    if (!fs.existsSync(this.baseDir)) return;
    try {
      const entries = fs.readdirSync(this.baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const manifestPath = path.join(this.baseDir, entry.name, 'manifest.json');
          if (fs.existsSync(manifestPath)) {
            try {
              const data = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as ChangeSet;
              this.changeSets.set(data.id, data);
            } catch {
              // Ignore corrupted manifest
            }
          }
        }
      }
    } catch {
      // Best-effort load
    }
  }

  private saveManifest(changeSet: ChangeSet): void {
    const csDir = path.join(this.baseDir, changeSet.id);
    if (!fs.existsSync(csDir)) {
      fs.mkdirSync(csDir, { recursive: true });
    }
    const manifestPath = path.join(csDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(changeSet, null, 2), 'utf-8');
  }

  public beginChangeSet(description?: string): string {
    const id = `cs_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const changeSet: ChangeSet = {
      id,
      timestamp: Date.now(),
      description,
      entries: [],
      restored: false,
    };
    this.changeSets.set(id, changeSet);
    this.currentChangeSetId = id;
    this.saveManifest(changeSet);
    return id;
  }

  public async backupFile(filePath: string, changeSetId?: string): Promise<BackupEntry> {
    const csId = changeSetId || this.currentChangeSetId || this.beginChangeSet();
    const changeSet = this.changeSets.get(csId);
    if (!changeSet) {
      throw new Error(`ChangeSet '${csId}' not found`);
    }

    const resolved = path.resolve(filePath);

    // If already backed up in this change set, don't overwrite previous original state
    const existing = changeSet.entries.find((e) => e.originalPath === resolved);
    if (existing) {
      return existing;
    }

    const csDir = path.join(this.baseDir, csId);
    if (!fs.existsSync(csDir)) {
      fs.mkdirSync(csDir, { recursive: true });
    }

    if (!fs.existsSync(resolved)) {
      const entry: BackupEntry = {
        originalPath: resolved,
        existed: false,
      };
      changeSet.entries.push(entry);
      this.saveManifest(changeSet);
      return entry;
    }

    const content = fs.readFileSync(resolved);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    const safeName = `${path.basename(resolved)}.${hash.slice(0, 12)}.bak`;
    const backupFilePath = path.join(csDir, safeName);

    fs.writeFileSync(backupFilePath, content);

    const entry: BackupEntry = {
      originalPath: resolved,
      backupPath: backupFilePath,
      existed: true,
      sha256: hash,
    };

    changeSet.entries.push(entry);
    this.saveManifest(changeSet);
    return entry;
  }

  public async undo(changeSetId?: string): Promise<UndoResult> {
    let targetCs: ChangeSet | undefined;

    if (changeSetId) {
      targetCs = this.changeSets.get(changeSetId);
    } else {
      // Pick latest non-restored change set
      const all = Array.from(this.changeSets.values()).sort((a, b) => b.timestamp - a.timestamp);
      targetCs = all.find((cs) => !cs.restored);
    }

    if (!targetCs) {
      throw new Error('No change set available to undo');
    }

    const result: UndoResult = {
      changeSetId: targetCs.id,
      restoredCount: 0,
      removedCount: 0,
      errors: [],
    };

    // Revert in reverse order of change recordings
    for (let i = targetCs.entries.length - 1; i >= 0; i--) {
      const entry = targetCs.entries[i]!;
      try {
        if (entry.existed && entry.backupPath) {
          if (fs.existsSync(entry.backupPath)) {
            const parent = path.dirname(entry.originalPath);
            if (!fs.existsSync(parent)) {
              fs.mkdirSync(parent, { recursive: true });
            }
            fs.copyFileSync(entry.backupPath, entry.originalPath);
            result.restoredCount++;
          } else {
            result.errors.push(`Backup file '${entry.backupPath}' missing`);
          }
        } else if (!entry.existed) {
          // File was created during change set; remove it
          if (fs.existsSync(entry.originalPath)) {
            fs.rmSync(entry.originalPath, { force: true });
            result.removedCount++;
          }
        }
      } catch (err) {
        result.errors.push(
          `Failed reverting '${entry.originalPath}': ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    targetCs.restored = true;
    this.saveManifest(targetCs);

    if (this.currentChangeSetId === targetCs.id) {
      this.currentChangeSetId = null;
    }

    return result;
  }

  public listChangeSets(): ChangeSet[] {
    return Array.from(this.changeSets.values()).sort((a, b) => b.timestamp - a.timestamp);
  }

  public getLatestChangeSet(): ChangeSet | null {
    const list = this.listChangeSets();
    return list.length > 0 ? list[0]! : null;
  }
}

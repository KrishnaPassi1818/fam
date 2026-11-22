import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

export interface OfficeBackupResult {
  backupPath: string;
  originalPath: string;
  originalSha256: string;
  timestamp: number;
}

/**
 * Creates a pre-write backup of an existing office file in ~/.harness/backups/office/
 */
export async function createPreWriteBackup(
  filePath: string,
  backupDir?: string,
): Promise<OfficeBackupResult | null> {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    return null;
  }

  const dir = backupDir || path.join(os.homedir(), '.harness', 'backups', 'office');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const content = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(content).digest('hex');
  const timestamp = Date.now();
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const backupFilename = `${base}_${timestamp}_${sha256.slice(0, 8)}${ext}`;
  const backupPath = path.join(dir, backupFilename);

  fs.writeFileSync(backupPath, content);

  return {
    backupPath,
    originalPath: path.resolve(filePath),
    originalSha256: sha256,
    timestamp,
  };
}

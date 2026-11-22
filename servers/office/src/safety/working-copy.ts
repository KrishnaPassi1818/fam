import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { createPreWriteBackup } from './backup.js';
import { verifyOfficeFile } from './verification.js';

export interface WorkingCopyExecutionResult<T> {
  result: T;
  changeSummary: string;
  targetPath: string;
  backupPath?: string;
  verified: boolean;
}

/**
 * Executes a write operation safely:
 * 1. Takes pre-write backup if target already exists.
 * 2. Prepares a temporary working copy.
 * 3. Runs operation on working copy.
 * 4. Verifies working copy with verify-by-reopen before committing.
 * 5. Atomically replaces target with working copy.
 * 6. Discards working copy on error, leaving target untouched.
 */
export async function withWorkingCopy<T>(
  targetPath: string,
  format: 'xlsx' | 'docx' | 'pptx' | 'pdf',
  changeDescription: string,
  operation: (workingPath: string) => Promise<T>,
): Promise<WorkingCopyExecutionResult<T>> {
  const resolvedTarget = path.resolve(targetPath);
  const targetDir = path.dirname(resolvedTarget);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // 1. Pre-write backup
  const backup = await createPreWriteBackup(resolvedTarget);

  // 2. Prepare temporary working copy
  const rand = crypto.randomBytes(4).toString('hex');
  const ext = path.extname(resolvedTarget);
  const base = path.basename(resolvedTarget, ext);
  const workingPath = path.join(targetDir, `.${base}.tmp.${Date.now()}.${rand}${ext}`);

  try {
    if (fs.existsSync(resolvedTarget)) {
      fs.copyFileSync(resolvedTarget, workingPath);
    }

    // 3. Run operation on working copy
    const result = await operation(workingPath);

    // 4. Verify working copy
    const verification = await verifyOfficeFile(workingPath, format);
    if (!verification.valid) {
      throw new Error(`Verification failed for generated ${format} file: ${verification.error}`);
    }

    // 5. Atomic swap
    fs.renameSync(workingPath, resolvedTarget);

    const changeSummary = backup
      ? `Updated '${path.basename(resolvedTarget)}' (${changeDescription}). Pre-write backup created at ${backup.backupPath}. Integrity verified.`
      : `Created '${path.basename(resolvedTarget)}' (${changeDescription}). Integrity verified.`;

    return {
      result,
      changeSummary,
      targetPath: resolvedTarget,
      backupPath: backup?.backupPath,
      verified: true,
    };
  } catch (err) {
    // Discard temporary working copy if it still exists
    if (fs.existsSync(workingPath)) {
      try {
        fs.unlinkSync(workingPath);
      } catch {
        // Ignore unlink error
      }
    }
    throw err;
  }
}

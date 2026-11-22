import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveConfinedPath, OfficeSecurityError } from '../safety/confinement.js';
import { createPreWriteBackup } from '../safety/backup.js';
import { verifyOfficeFile } from '../safety/verification.js';
import { withWorkingCopy } from '../safety/working-copy.js';

describe('Office Safety Layer (T7.1)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hx_safety_test_'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Confinement', () => {
    it('allows valid paths within workspace', () => {
      const res = resolveConfinedPath('doc.docx', tempDir, false);
      expect(res.resolvedPath).toBe(path.join(tempDir, 'doc.docx'));
      expect(res.isOutsideWorkspace).toBe(false);
    });

    it('rejects null bytes', () => {
      expect(() => resolveConfinedPath('doc.docx\0.exe', tempDir)).toThrow(OfficeSecurityError);
    });

    it('detects and flags outside-workspace paths', () => {
      const res = resolveConfinedPath('/etc/passwd', tempDir, true);
      expect(res.isOutsideWorkspace).toBe(true);
    });

    it('blocks outside-workspace paths when allowOutside is false', () => {
      expect(() => resolveConfinedPath('../../secret.txt', tempDir, false)).toThrow(
        OfficeSecurityError,
      );
    });
  });

  describe('Pre-Write Backup', () => {
    it('creates backup with original content and sha256', async () => {
      const testFile = path.join(tempDir, 'sample.txt');
      fs.writeFileSync(testFile, 'initial content', 'utf-8');

      const backupDir = path.join(tempDir, 'backups');
      const backup = await createPreWriteBackup(testFile, backupDir);

      expect(backup).not.toBeNull();
      expect(fs.existsSync(backup!.backupPath)).toBe(true);
      expect(fs.readFileSync(backup!.backupPath, 'utf-8')).toBe('initial content');
      expect(backup!.originalSha256).toBeDefined();
    });

    it('returns null if file does not exist', async () => {
      const backup = await createPreWriteBackup(path.join(tempDir, 'nonexistent.txt'));
      expect(backup).toBeNull();
    });
  });

  describe('Verify Office File', () => {
    it('detects empty (0 byte) file as invalid', async () => {
      const emptyFile = path.join(tempDir, 'empty.docx');
      fs.writeFileSync(emptyFile, '');
      const res = await verifyOfficeFile(emptyFile, 'docx');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('zero bytes');
    });

    it('detects non-existent file as invalid', async () => {
      const res = await verifyOfficeFile(path.join(tempDir, 'ghost.xlsx'), 'xlsx');
      expect(res.valid).toBe(false);
    });
  });

  describe('Working Copy Safety', () => {
    it('leaves target untouched if operation fails during write', async () => {
      const target = path.join(tempDir, 'doc.docx');
      fs.writeFileSync(target, 'original intact content', 'utf-8');

      await expect(
        withWorkingCopy(target, 'docx', 'failing op', async (workingPath) => {
          fs.writeFileSync(workingPath, 'corrupted data');
          throw new Error('Simulation of catastrophic failure');
        }),
      ).rejects.toThrow('Simulation of catastrophic failure');

      // Original must still have untouched content
      expect(fs.readFileSync(target, 'utf-8')).toBe('original intact content');
    });
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { BackupService } from '../backup/index.js';

describe('BackupService (T3.5)', () => {
  let tmpBackupDir: string;
  let tmpWorkspaceDir: string;
  let backupService: BackupService;

  beforeEach(() => {
    tmpBackupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fam-backup-test-'));
    tmpWorkspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fam-ws-test-'));
    backupService = new BackupService(tmpBackupDir);
  });

  afterEach(() => {
    fs.rmSync(tmpBackupDir, { recursive: true, force: true });
    fs.rmSync(tmpWorkspaceDir, { recursive: true, force: true });
  });

  it('records existing files and restores them on undo', async () => {
    const targetFile = path.join(tmpWorkspaceDir, 'file.txt');
    fs.writeFileSync(targetFile, 'original content v1', 'utf-8');

    const csId = backupService.beginChangeSet('edit file.txt');
    await backupService.backupFile(targetFile, csId);

    // Simulate modifying the file
    fs.writeFileSync(targetFile, 'modified content v2', 'utf-8');
    expect(fs.readFileSync(targetFile, 'utf-8')).toBe('modified content v2');

    // Perform undo
    const undoRes = await backupService.undo(csId);
    expect(undoRes.restoredCount).toBe(1);
    expect(undoRes.removedCount).toBe(0);
    expect(undoRes.errors).toHaveLength(0);

    // Verify file content restored
    expect(fs.readFileSync(targetFile, 'utf-8')).toBe('original content v1');
  });

  it('records newly created files and removes them on undo', async () => {
    const newFile = path.join(tmpWorkspaceDir, 'new-file.txt');
    expect(fs.existsSync(newFile)).toBe(false);

    const csId = backupService.beginChangeSet('create new-file.txt');
    await backupService.backupFile(newFile, csId);

    // Simulate file creation
    fs.writeFileSync(newFile, 'newly created content', 'utf-8');
    expect(fs.existsSync(newFile)).toBe(true);

    // Perform undo
    const undoRes = await backupService.undo(csId);
    expect(undoRes.removedCount).toBe(1);
    expect(undoRes.restoredCount).toBe(0);

    // Verify file deleted
    expect(fs.existsSync(newFile)).toBe(false);
  });

  it('handles multi-file change set atomically', async () => {
    const file1 = path.join(tmpWorkspaceDir, 'doc1.md');
    const file2 = path.join(tmpWorkspaceDir, 'doc2.md');
    const file3 = path.join(tmpWorkspaceDir, 'doc3.md');

    fs.writeFileSync(file1, 'initial doc 1', 'utf-8');
    fs.writeFileSync(file2, 'initial doc 2', 'utf-8');
    // file3 does not exist initially

    const csId = backupService.beginChangeSet('multi-file batch');
    await backupService.backupFile(file1, csId);
    await backupService.backupFile(file2, csId);
    await backupService.backupFile(file3, csId);

    // Modifications
    fs.writeFileSync(file1, 'updated doc 1', 'utf-8');
    fs.writeFileSync(file2, 'updated doc 2', 'utf-8');
    fs.writeFileSync(file3, 'created doc 3', 'utf-8');

    const undoRes = await backupService.undo(csId);
    expect(undoRes.restoredCount).toBe(2);
    expect(undoRes.removedCount).toBe(1);

    expect(fs.readFileSync(file1, 'utf-8')).toBe('initial doc 1');
    expect(fs.readFileSync(file2, 'utf-8')).toBe('initial doc 2');
    expect(fs.existsSync(file3)).toBe(false);
  });

  it('throws error when no active change set is available to undo', async () => {
    await expect(backupService.undo()).rejects.toThrow('No change set available to undo');
  });
});

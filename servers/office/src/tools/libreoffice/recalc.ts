import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { LibreOfficeManager } from './manager.js';
import { withWorkingCopy } from '../../safety/working-copy.js';

export interface RecalcOptions {
  path: string;
  timeoutMs?: number;
}

export interface RecalcResult {
  path: string;
  recalculated: boolean;
  fileSize: number;
}

/**
 * Recalculates formula values in an Excel or Calc spreadsheet by opening,
 * recalculating, and saving via headless LibreOffice.
 */
export async function recalc(options: RecalcOptions) {
  const { path: filePath, timeoutMs = 30000 } = options;

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const ext = path.extname(filePath).replace('.', '').toLowerCase();
  const format: 'xlsx' = ext === 'xls' ? 'xlsx' : 'xlsx';

  return await withWorkingCopy(
    filePath,
    format,
    'recalculated spreadsheet formula values',
    async (workingPath) => {
      const manager = LibreOfficeManager.getInstance();
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recalc_'));

      try {
        // Convert to itself in tempDir, which forces formula recalculation
        const extName = path.extname(workingPath).replace('.', '');
        const res = await manager.execute({
          args: ['--convert-to', extName, workingPath, '--outdir', tempDir],
          timeoutMs,
        });

        const outputFileName = path.basename(workingPath);
        const generatedFile = path.join(tempDir, outputFileName);

        if (res.exitCode !== 0 || !fs.existsSync(generatedFile)) {
          throw new Error(`LibreOffice recalc failed: ${res.stderr || res.stdout}`);
        }

        fs.copyFileSync(generatedFile, workingPath);
        const stat = fs.statSync(workingPath);

        return {
          path: filePath,
          recalculated: true,
          fileSize: stat.size,
        };
      } finally {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
          // Ignore temp cleanup errors
        }
      }
    },
  );
}

import * as fs from 'node:fs';
import * as path from 'node:path';
import { LibreOfficeManager } from './manager.js';

export interface ConvertOptions {
  path: string;
  to: string; // e.g. "pdf", "docx", "xlsx", "odt", "ods", "html"
  outdir?: string;
  timeoutMs?: number;
}

export interface ConvertResult {
  inputPath: string;
  outputPath: string;
  format: string;
  fileSize: number;
}

/**
 * Converts document between formats using headless LibreOffice.
 */
export async function convert(options: ConvertOptions): Promise<ConvertResult> {
  const { path: inputPath, to: targetFormat, outdir, timeoutMs = 30000 } = options;

  if (!fs.existsSync(inputPath)) {
    throw new Error(`File not found: ${inputPath}`);
  }

  const resolvedInput = path.resolve(inputPath);
  const resolvedOutDir = outdir ? path.resolve(outdir) : path.dirname(resolvedInput);

  if (!fs.existsSync(resolvedOutDir)) {
    fs.mkdirSync(resolvedOutDir, { recursive: true });
  }

  const cleanTarget = targetFormat.replace(/^\./, '').toLowerCase();
  const inputBase = path.basename(resolvedInput, path.extname(resolvedInput));
  const expectedOutput = path.join(resolvedOutDir, `${inputBase}.${cleanTarget}`);

  const manager = LibreOfficeManager.getInstance();
  const res = await manager.execute({
    args: ['--convert-to', cleanTarget, resolvedInput, '--outdir', resolvedOutDir],
    timeoutMs,
  });

  if (res.exitCode !== 0 || !fs.existsSync(expectedOutput)) {
    throw new Error(
      `LibreOffice conversion failed (exit code ${res.exitCode}): ${res.stderr || res.stdout || 'output file not generated'}`,
    );
  }

  const stat = fs.statSync(expectedOutput);
  if (stat.size === 0) {
    throw new Error(`LibreOffice generated an empty (0 byte) file at ${expectedOutput}`);
  }

  return {
    inputPath: resolvedInput,
    outputPath: expectedOutput,
    format: cleanTarget,
    fileSize: stat.size,
  };
}

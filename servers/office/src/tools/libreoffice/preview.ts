import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { convert } from './convert.js';

const execFileAsync = promisify(execFile);

export interface RenderPreviewOptions {
  path: string;
  pages?: string; // e.g. "1-3", "1", "all"
  outdir?: string;
  dpi?: number; // default 150
}

export interface RenderPreviewResult {
  documentPath: string;
  previewImages: string[];
  pageCount: number;
}

/**
 * Renders document pages as PNG images for preview/vision inspection.
 * Converts to PDF (if not already PDF), then renders pages via pdftoppm.
 */
export async function render_preview(options: RenderPreviewOptions): Promise<RenderPreviewResult> {
  const { path: docPath, pages = '1', outdir, dpi = 150 } = options;

  if (!fs.existsSync(docPath)) {
    throw new Error(`Document not found: ${docPath}`);
  }

  const resolvedDoc = path.resolve(docPath);
  const resolvedOutDir = outdir ? path.resolve(outdir) : path.dirname(resolvedDoc);

  if (!fs.existsSync(resolvedOutDir)) {
    fs.mkdirSync(resolvedOutDir, { recursive: true });
  }

  let pdfPath = resolvedDoc;
  let tempPdfDir: string | null = null;

  const ext = path.extname(resolvedDoc).toLowerCase();
  if (ext !== '.pdf') {
    tempPdfDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preview_pdf_'));
    const converted = await convert({
      path: resolvedDoc,
      to: 'pdf',
      outdir: tempPdfDir,
    });
    pdfPath = converted.outputPath;
  }

  try {
    const baseName = path.basename(resolvedDoc, ext);
    const prefix = path.join(resolvedOutDir, `${baseName}_page`);

    const pdftoppmArgs = ['-png', '-r', String(dpi)];

    if (pages !== 'all') {
      const match = pages.match(/^(\d+)(?:-(\d+))?$/);
      if (match) {
        const first = match[1]!;
        const last = match[2] || first;
        pdftoppmArgs.push('-f', first, '-l', last);
      }
    }

    pdftoppmArgs.push(pdfPath, prefix);

    await execFileAsync('pdftoppm', pdftoppmArgs);

    // Collect generated preview images
    const outFiles = fs.readdirSync(resolvedOutDir);
    const prefixBase = `${baseName}_page`;
    const previewImages = outFiles
      .filter((f) => f.startsWith(prefixBase) && f.endsWith('.png'))
      .sort()
      .map((f) => path.join(resolvedOutDir, f));

    return {
      documentPath: resolvedDoc,
      previewImages,
      pageCount: previewImages.length,
    };
  } finally {
    if (tempPdfDir && fs.existsSync(tempPdfDir)) {
      try {
        fs.rmSync(tempPdfDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup
      }
    }
  }
}

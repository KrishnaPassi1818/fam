import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PDFParse } from 'pdf-parse';

const execFileAsync = promisify(execFile);

export interface PdfReadOptions {
  path: string;
  pages?: string; // e.g. "1-5", "2", "all"
  max_chars?: number; // default 8000
}

export interface PdfReadResult {
  pageCount?: number;
  pagesRead: string;
  content: string;
  truncated: boolean;
  totalChars: number;
}

/**
 * Reads a PDF file using pdftotext CLI (fast, page-bounded) with fallback to pdf-parse.
 */
export async function pdf_read(options: PdfReadOptions): Promise<PdfReadResult> {
  const { path: rawPath, pages = 'all', max_chars = 8000 } = options;

  let filePath = rawPath;
  if (!fs.existsSync(filePath)) {
    const candidateCwd = path.resolve(process.cwd(), rawPath);
    if (fs.existsSync(candidateCwd)) {
      filePath = candidateCwd;
    } else {
      const candidateBench = path.resolve(process.cwd(), 'hx-benchmark-workspace', rawPath);
      if (fs.existsSync(candidateBench)) {
        filePath = candidateBench;
      } else {
        throw new Error(`File not found: ${rawPath}`);
      }
    }
  }

  let text = '';
  let pageCount: number | undefined;

  // 1. Try pdftotext
  let pdftotextSuccess = false;
  try {
    const args = [filePath, '-'];
    if (pages !== 'all') {
      const match = pages.match(/^(\d+)(?:-(\d+))?$/);
      if (match) {
        const first = match[1]!;
        const last = match[2] || first;
        args.unshift('-l', last);
        args.unshift('-f', first);
      }
    }

    const { stdout } = await execFileAsync('pdftotext', args, { maxBuffer: 10 * 1024 * 1024 });
    text = stdout;
    pdftotextSuccess = true;
  } catch {
    pdftotextSuccess = false;
  }

  // 2. Fallback to pdf-parse if pdftotext failed
  if (!pdftotextSuccess) {
    const buffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: buffer });
    const res = await parser.getText();
    text = res.text;
    pageCount = res.total;
    await parser.destroy();
  }

  const totalChars = text.length;
  let truncated = false;
  if (text.length > max_chars) {
    text = text.slice(0, max_chars) + `\n\n... [Truncated: showing ${max_chars} of ${totalChars} characters]`;
    truncated = true;
  }

  return {
    pageCount,
    pagesRead: pages,
    content: text,
    truncated,
    totalChars,
  };
}

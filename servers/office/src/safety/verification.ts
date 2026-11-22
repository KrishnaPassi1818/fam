import * as fs from 'node:fs';
import * as path from 'node:path';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import mammoth from 'mammoth';

export interface VerificationResult {
  valid: boolean;
  format: string;
  error?: string;
  details?: Record<string, unknown>;
}

/**
 * Re-opens the saved office file using official format libraries to verify structural integrity.
 */
export async function verifyOfficeFile(
  filePath: string,
  expectedFormat?: 'xlsx' | 'docx' | 'pptx' | 'pdf',
): Promise<VerificationResult> {
  if (!fs.existsSync(filePath)) {
    return { valid: false, format: 'unknown', error: `File not found: ${filePath}` };
  }

  const ext = (expectedFormat || path.extname(filePath).replace('.', '')).toLowerCase();

  try {
    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      return { valid: false, format: ext, error: 'File is zero bytes (empty)' };
    }

    if (ext === 'xlsx' || ext === 'xls') {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.readFile(filePath);
      if (wb.worksheets.length === 0) {
        return { valid: false, format: ext, error: 'Workbook contains 0 worksheets' };
      }
      return {
        valid: true,
        format: ext,
        details: {
          sheets: wb.worksheets.map((s) => ({ name: s.name, rowCount: s.rowCount })),
        },
      };
    }

    if (ext === 'docx' || ext === 'doc') {
      const buf = fs.readFileSync(filePath);
      const zip = await JSZip.loadAsync(buf);
      const docXml = zip.file('word/document.xml');
      if (!docXml) {
        return { valid: false, format: ext, error: 'Missing word/document.xml in docx package' };
      }
      // Test text extraction via mammoth
      const extracted = await mammoth.extractRawText({ buffer: buf });
      return {
        valid: true,
        format: ext,
        details: {
          charCount: extracted.value.length,
          messages: extracted.messages.map((m) => m.message),
        },
      };
    }

    if (ext === 'pptx' || ext === 'ppt') {
      const buf = fs.readFileSync(filePath);
      const zip = await JSZip.loadAsync(buf);
      const presXml = zip.file('ppt/presentation.xml');
      if (!presXml) {
        return { valid: false, format: ext, error: 'Missing ppt/presentation.xml in pptx package' };
      }
      const slideFiles = Object.keys(zip.files).filter((k) => k.startsWith('ppt/slides/slide'));
      return {
        valid: true,
        format: ext,
        details: {
          slideCount: slideFiles.length,
        },
      };
    }

    if (ext === 'pdf') {
      const buf = fs.readFileSync(filePath);
      const header = buf.subarray(0, 5).toString('ascii');
      if (header !== '%PDF-') {
        return { valid: false, format: ext, error: 'Invalid PDF header' };
      }
      return {
        valid: true,
        format: ext,
        details: {
          fileSize: stats.size,
        },
      };
    }

    // Default fallback check: non-empty file
    return { valid: true, format: ext };
  } catch (err) {
    return {
      valid: false,
      format: ext,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

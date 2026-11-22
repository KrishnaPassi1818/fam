import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { convert } from '../tools/libreoffice/convert.js';
import { recalc } from '../tools/libreoffice/recalc.js';
import { render_preview } from '../tools/libreoffice/preview.js';
import { docx_create_from_markdown } from '../tools/write/docx.js';
import { xlsx_create_from_csv, xlsx_add_formula } from '../tools/write/xlsx.js';
import { verifyOfficeFile } from '../safety/verification.js';

describe('LibreOffice Manager & Conversions (T7.7)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hx_libreoffice_test_'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('converts docx -> pdf, docx -> odt, and xlsx -> pdf', async () => {
    // 1. Create DOCX
    const mdPath = path.join(tempDir, 'sample.md');
    fs.writeFileSync(mdPath, '# Conversion Matrix Test\n\nTesting format conversions.\n', 'utf-8');
    const docxPath = path.join(tempDir, 'sample.docx');
    await docx_create_from_markdown({ mdPath, docxPath });

    // DOCX -> PDF
    const pdfRes = await convert({ path: docxPath, to: 'pdf', outdir: tempDir });
    expect(fs.existsSync(pdfRes.outputPath)).toBe(true);
    expect(pdfRes.fileSize).toBeGreaterThan(0);
    const pdfVerify = await verifyOfficeFile(pdfRes.outputPath, 'pdf');
    expect(pdfVerify.valid).toBe(true);

    // DOCX -> ODT
    const odtRes = await convert({ path: docxPath, to: 'odt', outdir: tempDir });
    expect(fs.existsSync(odtRes.outputPath)).toBe(true);
    expect(odtRes.fileSize).toBeGreaterThan(0);

    // 2. Create XLSX
    const csvPath = path.join(tempDir, 'data.csv');
    fs.writeFileSync(csvPath, 'Name,Score\nAlice,95\nBob,88\n', 'utf-8');
    const xlsxPath = path.join(tempDir, 'data.xlsx');
    await xlsx_create_from_csv({ csvPath, xlsxPath });

    // XLSX -> PDF
    const xlsxPdfRes = await convert({ path: xlsxPath, to: 'pdf', outdir: tempDir });
    expect(fs.existsSync(xlsxPdfRes.outputPath)).toBe(true);
    expect(xlsxPdfRes.fileSize).toBeGreaterThan(0);
  }, 40000);

  it('recalculates formulas in spreadsheet', async () => {
    const csvPath = path.join(tempDir, 'numbers.csv');
    fs.writeFileSync(csvPath, 'A,B\n10,20\n30,40\n', 'utf-8');
    const xlsxPath = path.join(tempDir, 'calc.xlsx');
    await xlsx_create_from_csv({ csvPath, xlsxPath });
    await xlsx_add_formula({ path: xlsxPath, cell: 'C1', formula: '=A1+B1' });

    const recalcRes = await recalc({ path: xlsxPath });
    expect(recalcRes.verified).toBe(true);
    expect(recalcRes.result.recalculated).toBe(true);
  }, 30000);

  it('renders page preview as PNG images', async () => {
    const mdPath = path.join(tempDir, 'preview.md');
    fs.writeFileSync(mdPath, '# Visual Preview Test\n\nPage rendering verification.\n', 'utf-8');
    const docxPath = path.join(tempDir, 'preview.docx');
    await docx_create_from_markdown({ mdPath, docxPath });

    const previewRes = await render_preview({ path: docxPath, pages: '1', outdir: tempDir });
    expect(previewRes.pageCount).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(previewRes.previewImages[0]!)).toBe(true);
    expect(previewRes.previewImages[0]!.endsWith('.png')).toBe(true);
  }, 30000);
});

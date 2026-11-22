import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { docx_read } from '../tools/read/docx.js';
import { xlsx_describe, xlsx_read_range } from '../tools/read/xlsx.js';
import { pptx_read } from '../tools/read/pptx.js';
import { pdf_read } from '../tools/read/pdf.js';
import { xlsx_create_from_csv } from '../tools/write/xlsx.js';
import { docx_create_from_markdown } from '../tools/write/docx.js';
import { pptx_create, pptx_add_slide } from '../tools/write/pptx.js';
import { convert } from '../tools/libreoffice/convert.js';

describe('Office Read Tools (T7.2)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hx_read_test_'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('docx_read extracts outline and bounded content', async () => {
    const mdPath = path.join(tempDir, 'source.md');
    fs.writeFileSync(
      mdPath,
      '# Project Overview\n\nThis is the executive summary.\n\n## Architecture\n\nDetailed system design.\n\n## Deliverables\n\n- File 1\n- File 2\n',
      'utf-8',
    );

    const docxPath = path.join(tempDir, 'test.docx');
    await docx_create_from_markdown({ mdPath, docxPath, title: 'Document Title' });

    const readRes = await docx_read({ path: docxPath });
    expect(readRes.outline.length).toBeGreaterThan(0);
    expect(readRes.content).toContain('Project Overview');
    expect(readRes.truncated).toBe(false);

    // Section filtering
    const sectionRes = await docx_read({ path: docxPath, section: 'Architecture' });
    expect(sectionRes.content).toContain('Detailed system design');
  });

  it('xlsx_describe and xlsx_read_range inspect and slice workbook', async () => {
    const csvPath = path.join(tempDir, 'data.csv');
    fs.writeFileSync(
      csvPath,
      'Region,Q1,Q2,Total,Active\nNorth,100,200,300,true\nSouth,150,250,400,false\nEast,120,180,300,true\n',
      'utf-8',
    );

    const xlsxPath = path.join(tempDir, 'sales.xlsx');
    await xlsx_create_from_csv({ csvPath, xlsxPath, sheetName: 'Sales' });

    const desc = await xlsx_describe(xlsxPath);
    expect(desc.sheetCount).toBe(1);
    expect(desc.sheets[0]!.name).toBe('Sales');
    expect(desc.sheets[0]!.headers).toEqual(['Region', 'Q1', 'Q2', 'Total', 'Active']);
    expect(desc.sheets[0]!.sampleRows.length).toBe(3);
    expect(desc.sheets[0]!.types['Q1']).toBe('integer');

    // Read range as markdown
    const rangeRes = await xlsx_read_range({ path: xlsxPath, range: 'A1:C3', format: 'markdown' });
    expect(rangeRes.content).toContain('| Region | Q1 | Q2 |');
    expect(rangeRes.content).toContain('| North | 100 | 200 |');
    expect(rangeRes.rowCount).toBe(3);

    // Read range as CSV
    const csvRes = await xlsx_read_range({ path: xlsxPath, range: 'A1:C3', format: 'csv' });
    expect(csvRes.content).toContain('Region,Q1,Q2');
    expect(csvRes.content).toContain('North,100,200');
  });

  it('pptx_read extracts slides, titles, bullets, and speaker notes', async () => {
    const pptxPath = path.join(tempDir, 'deck.pptx');
    await pptx_create({ path: pptxPath, title: 'Quarterly Review', subtitle: 'Q4 2026' });
    await pptx_add_slide({
      path: pptxPath,
      title: 'Key Accomplishments',
      bullets: ['Shipped v1.0 on schedule', 'Reached 100k daily active users'],
      notes: 'Remember to thank the engineering team',
    });

    const readRes = await pptx_read(pptxPath);
    expect(readRes.slideCount).toBe(2);
    expect(readRes.outline).toContain('Key Accomplishments');
    expect(readRes.outline).toContain('Shipped v1.0 on schedule');
    expect(readRes.outline).toContain('Notes: Remember to thank the engineering team');
  });

  it('pdf_read extracts bounded text from PDF', async () => {
    // Generate sample PDF via LibreOffice conversion from markdown->docx->pdf
    const mdPath = path.join(tempDir, 'source.md');
    fs.writeFileSync(mdPath, '# PDF Test Document\n\nThis is paragraph one of the PDF text test.\n', 'utf-8');
    const docxPath = path.join(tempDir, 'doc.docx');
    await docx_create_from_markdown({ mdPath, docxPath });
    const pdfRes = await convert({ path: docxPath, to: 'pdf', outdir: tempDir });

    const readRes = await pdf_read({ path: pdfRes.outputPath });
    expect(readRes.content).toContain('PDF Test Document');
    expect(readRes.content).toContain('This is paragraph one');
    expect(readRes.truncated).toBe(false);
  });
});

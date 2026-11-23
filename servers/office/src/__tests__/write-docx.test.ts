import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  docx_create_from_markdown,
  docx_replace_text,
  docx_insert_paragraph,
  docx_add_table,
  docx_apply_template,
} from '../tools/write/docx.js';
import { docx_read } from '../tools/read/docx.js';

describe('DOCX Write Tools (T7.5)', () => {
  let tempDir: string;
  let docxPath: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fam_docx_write_test_'));
    const mdPath = path.join(tempDir, 'init.md');
    fs.writeFileSync(
      mdPath,
      '# Project Contract\n\nClient Name: {{client_name}}\nEffective Date: {{start_date}}\n\n## Terms and Conditions\n\nStandard terms apply.\n',
      'utf-8',
    );
    docxPath = path.join(tempDir, 'contract.docx');
    await docx_create_from_markdown({ mdPath, docxPath });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('docx_replace_text performs run-split safe text replacement', async () => {
    const res = await docx_replace_text({
      path: docxPath,
      search: 'Terms and Conditions',
      replace: 'Rules and Regulations',
    });

    expect(res.result.replacementsCount).toBeGreaterThanOrEqual(1);
    expect(res.verified).toBe(true);

    const read = await docx_read({ path: docxPath });
    expect(read.content).toContain('Rules and Regulations');
    expect(read.content).not.toContain('Terms and Conditions');
  });

  it('docx_insert_paragraph inserts paragraph after heading', async () => {
    const res = await docx_insert_paragraph({
      path: docxPath,
      text: 'Payment is due within 30 days of invoice.',
      after_heading: 'Terms and Conditions',
    });

    expect(res.result.inserted).toBe(true);
    expect(res.verified).toBe(true);

    const read = await docx_read({ path: docxPath });
    expect(read.content).toContain('Payment is due within 30 days of invoice.');
  });

  it('docx_add_table inserts structured table into document', async () => {
    const res = await docx_add_table({
      path: docxPath,
      headers: ['Milestone', 'Deliverable', 'Fee'],
      data: [
        ['Phase 1', 'Architecture Plan', '$5,000'],
        ['Phase 2', 'Working Implementation', '$15,000'],
      ],
    });

    expect(res.result.rowsCount).toBe(3);
    expect(res.result.colsCount).toBe(3);
    expect(res.verified).toBe(true);

    const read = await docx_read({ path: docxPath });
    expect(read.content).toContain('Architecture Plan');
    expect(read.content).toContain('$15,000');
  });

  it('docx_apply_template replaces all placeholder tokens', async () => {
    const outDoc = path.join(tempDir, 'final_contract.docx');
    const res = await docx_apply_template({
      templatePath: docxPath,
      outputPath: outDoc,
      data: {
        client_name: 'Acme Corporation',
        start_date: '2026-12-01',
      },
    });

    expect(res.totalReplacements).toBe(2);

    const read = await docx_read({ path: outDoc });
    expect(read.content).toContain('Client Name: Acme Corporation');
    expect(read.content).toContain('Effective Date: 2026-12-01');
    expect(read.content).not.toContain('{{client_name}}');
  });
});

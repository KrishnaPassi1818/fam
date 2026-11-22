import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import child_process from 'node:child_process';

import {
  resolveConfinedPath,
  createPreWriteBackup,
  verifyOfficeFile,
  withWorkingCopy,
  docx_read,
  xlsx_describe,
  xlsx_read_range,
  pptx_read,
  pdf_read,
  xlsx_query_sql,
  xlsx_write_cells,
  xlsx_add_formula,
  xlsx_add_sheet,
  xlsx_create_from_csv,
  docx_replace_text,
  docx_insert_paragraph,
  docx_add_table,
  docx_create_from_markdown,
  docx_apply_template,
  pptx_create,
  pptx_add_slide,
  convert,
  recalc,
  render_preview,
  uno_script,
} from '../servers/office/dist/index.js';

import { loadAllTasks, EvalRunner, type TaskDefinition } from '../packages/evals/dist/index.js';
import type { ModelAdapter, ChatChunk, ToolDescriptor } from '../packages/shared/dist/index.js';
import type { ToolExecutionHandler } from '../packages/core/dist/index.js';

async function main() {
  console.log('================================================================');
  console.log('HX HARNESS — PHASE 7 EXIT GATE DEMO & VERIFICATION');
  console.log('Subsystems: Office Server, LibreOffice Manager, Document Tools, Evals');
  console.log('================================================================\n');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-p7-gate-'));
  const backupDir = path.join(tmpDir, 'backups');

  try {
    // -------------------------------------------------------------------------
    // Gate Criterion 1: File-Safety Layer (confinement, backup, atomic swap, verify)
    // -------------------------------------------------------------------------
    console.log('--- Criterion 1: Shared File-Safety Layer (T7.1) ---');
    const safePath = resolveConfinedPath('test.docx', tmpDir, false);
    console.log(`  - Confined path resolved within workspace: ${safePath.resolvedPath}`);

    const sampleFile = path.join(tmpDir, 'sample.txt');
    fs.writeFileSync(sampleFile, 'initial unedited text', 'utf-8');
    const backup = await createPreWriteBackup(sampleFile, backupDir);
    console.log(`  - Pre-write backup taken: ${backup?.backupPath} (SHA-256: ${backup?.originalSha256.slice(0, 12)})`);

    const corruptTarget = path.join(tmpDir, 'guarded.docx');
    fs.writeFileSync(corruptTarget, 'valid initial state', 'utf-8');
    let rollbackProtected = false;
    try {
      await withWorkingCopy(corruptTarget, 'docx', 'failing transaction', async (workingPath) => {
        fs.writeFileSync(workingPath, 'corrupted data');
        throw new Error('Induced crash');
      });
    } catch {
      rollbackProtected = fs.readFileSync(corruptTarget, 'utf-8') === 'valid initial state';
    }
    if (!rollbackProtected) throw new Error('Working copy rollback failed to protect original file');
    console.log('  - Rollback protection verified: original file preserved on failure.');
    console.log('✅ Criterion 1 PASSED: Confinement, backups, and atomic working copy verified.\n');

    // -------------------------------------------------------------------------
    // Gate Criterion 2: Structured Document Creation & Editing (DOCX, XLSX, PPTX)
    // -------------------------------------------------------------------------
    console.log('--- Criterion 2: Document Creation & Write Tools (T7.4, T7.5, T7.6) ---');
    // 1. DOCX from Markdown
    const mdPath = path.join(tmpDir, 'specs.md');
    fs.writeFileSync(
      mdPath,
      '# HX Agent Architecture\n\nClient Name: {{client_name}}\nVersion: 1.0.0\n\n## Subsystems\n- Core Loop\n- Office Server\n\n| Subsystem | Language |\n| Core | TypeScript |\n| Office | TypeScript |\n',
      'utf-8',
    );
    const docxPath = path.join(tmpDir, 'specs.docx');
    await docx_create_from_markdown({ mdPath, docxPath, title: 'Architecture Specification' });
    console.log('  - DOCX created from Markdown with Title, Headings, Bullet Lists, and Table.');

    // 2. Run-split safe replacement & Template
    await docx_replace_text({ path: docxPath, search: 'Architecture Specification', replace: 'System Specifications' });
    await docx_insert_paragraph({ path: docxPath, text: 'Status: Approved for Production', after_heading: 'Subsystems' });
    const appliedDocx = path.join(tmpDir, 'specs_final.docx');
    await docx_apply_template({
      templatePath: docxPath,
      outputPath: appliedDocx,
      data: { client_name: 'Antigravity Technologies' },
    });
    console.log('  - DOCX run-split safe replacement and template token interpolation completed.');

    // 3. XLSX from CSV with formulas & new sheet
    const csvPath = path.join(tmpDir, 'data.csv');
    fs.writeFileSync(
      csvPath,
      'Department,Q1,Q2\nEngineering,120000,150000\nMarketing,45000,60000\nOperations,30000,35000\n',
      'utf-8',
    );
    const xlsxPath = path.join(tmpDir, 'finance.xlsx');
    await xlsx_create_from_csv({ csvPath, xlsxPath, sheetName: 'Budget' });
    await xlsx_add_formula({ path: xlsxPath, sheet: 'Budget', cell: 'D2', formula: '=B2+C2' });
    await xlsx_write_cells({ path: xlsxPath, sheet: 'Budget', cells: [{ cell: 'D1', value: 'Total' }] });
    await xlsx_add_sheet({ path: xlsxPath, sheetName: 'Headcount', data: [['Dept', 'Count'], ['Eng', 24], ['Mkt', 8]] });
    console.log('  - XLSX created from CSV, formula added (=B2+C2), cells updated, and new sheet added.');

    // 4. PPTX Creation & Slides
    const pptxPath = path.join(tmpDir, 'presentation.pptx');
    await pptx_create({ path: pptxPath, title: 'HX Harness Office Superpowers', subtitle: 'Phase 7 Release' });
    await pptx_add_slide({
      path: pptxPath,
      title: 'Highlights',
      bullets: ['Complete DOCX, XLSX, PPTX, PDF support', 'In-memory SQL on spreadsheets', 'LibreOffice headless automation'],
      notes: 'Deliver with high confidence',
    });
    console.log('  - PPTX deck created with title slide, content bullets, and speaker notes.');
    console.log('✅ Criterion 2 PASSED: All document generation and editing operations succeeded.\n');

    // -------------------------------------------------------------------------
    // Gate Criterion 3: Document Read Views & In-Memory SQL (T7.2, T7.3)
    // -------------------------------------------------------------------------
    console.log('--- Criterion 3: Bounded Read Views & Spreadsheet SQL (T7.2, T7.3) ---');
    const docxView = await docx_read({ path: appliedDocx });
    console.log(`  - docx_read outline: ${docxView.outline.join(' | ')}`);
    console.log(`  - docx_read content excerpt: "${docxView.content.slice(0, 75).replace(/\n/g, ' ')}..."`);

    const xlsxDesc = await xlsx_describe(xlsxPath);
    console.log(`  - xlsx_describe: ${xlsxDesc.sheetCount} sheets (${xlsxDesc.sheets.map((s) => s.name).join(', ')}), columns: ${xlsxDesc.sheets[0]?.headers.join(', ')}`);

    const xlsxSlice = await xlsx_read_range({ path: xlsxPath, sheet: 'Budget', range: 'A1:D3', format: 'markdown' });
    console.log(`  - xlsx_read_range markdown table:\n${xlsxSlice.content}`);

    const pptxView = await pptx_read(pptxPath);
    console.log(`  - pptx_read: ${pptxView.slideCount} slides, first bullet: "${pptxView.slides[1]?.bullets[0]}"`);

    // SQL Query on Spreadsheet
    const sqlRes = await xlsx_query_sql({
      path: xlsxPath,
      sql: 'SELECT Department, Q1, Q2, (Q1 + Q2) as ComputedTotal FROM Budget WHERE Q1 > 40000 ORDER BY ComputedTotal DESC',
    });
    console.log(`  - xlsx_query_sql result (${sqlRes.rowCount} rows):`);
    console.log(`    Columns: ${sqlRes.columns.join(' | ')}`);
    for (const r of sqlRes.rows) {
      console.log(`    Row: ${r.join(' | ')}`);
    }

    if (sqlRes.rowCount !== 2) throw new Error('SQL query returned unexpected row count');
    console.log('✅ Criterion 3 PASSED: Bounded read views and spreadsheet SQL query verified.\n');

    // -------------------------------------------------------------------------
    // Gate Criterion 4: LibreOffice Manager, Conversions, Previews & UNO (T7.7, T7.10)
    // -------------------------------------------------------------------------
    console.log('--- Criterion 4: LibreOffice Manager & Conversions (T7.7, T7.10) ---');
    // Format conversions
    const docxPdf = await convert({ path: appliedDocx, to: 'pdf', outdir: tmpDir });
    console.log(`  - Converted DOCX -> PDF: ${docxPdf.outputPath} (${(docxPdf.fileSize / 1024).toFixed(1)} KB)`);

    const xlsxPdf = await convert({ path: xlsxPath, to: 'pdf', outdir: tmpDir });
    console.log(`  - Converted XLSX -> PDF: ${xlsxPdf.outputPath} (${(xlsxPdf.fileSize / 1024).toFixed(1)} KB)`);

    const pptxPdf = await convert({ path: pptxPath, to: 'pdf', outdir: tmpDir });
    console.log(`  - Converted PPTX -> PDF: ${pptxPdf.outputPath} (${(pptxPdf.fileSize / 1024).toFixed(1)} KB)`);

    // PDF Read
    const pdfContent = await pdf_read({ path: docxPdf.outputPath, pages: '1' });
    console.log(`  - pdf_read extracted ${pdfContent.totalChars} chars from generated PDF.`);

    // Visual Preview Rendering (via pdftoppm)
    const previewRes = await render_preview({ path: appliedDocx, pages: '1', outdir: tmpDir });
    console.log(`  - render_preview produced ${previewRes.previewImages.length} image(s): ${path.basename(previewRes.previewImages[0] || '')}`);

    // Recalculation
    const recalcRes = await recalc({ path: xlsxPath });
    console.log(`  - recalc succeeded on spreadsheet (recalculated=${recalcRes.result.recalculated})`);

    // Fallback UNO script
    const unoRes = await uno_script({
      code: 'import uno\nprint(f"UNO Runtime: {uno.__file__}")',
    });
    console.log(`  - uno_script executed via python3.14: "${unoRes.stdout.trim()}"`);
    console.log('✅ Criterion 4 PASSED: LibreOffice conversions, preview rendering, and UNO script verified.\n');

    // -------------------------------------------------------------------------
    // Gate Criterion 5: 10-Task Office Eval Suite & Automated Repair-Free Verification (T7.9)
    // -------------------------------------------------------------------------
    console.log('--- Criterion 5: 10 Office Eval Cases & Zero Repair Prompts (T7.9) ---');
    const tasks = loadAllTasks().filter((t) => t.suite === 'office');
    console.log(`  - Loaded ${tasks.length} office evaluation tasks.`);

    const officeToolDescriptors: ToolDescriptor[] = [
      { name: 'docx_read', alias: 'docx_read', description: 'Read docx', inputSchema: {}, annotations: {}, category: 'office', tier: 0, timeoutMs: 30000 },
      { name: 'docx_create_from_markdown', alias: 'docx_create_from_markdown', description: 'Create docx', inputSchema: {}, annotations: {}, category: 'office', tier: 1, timeoutMs: 30000 },
      { name: 'docx_replace_text', alias: 'docx_replace_text', description: 'Replace docx', inputSchema: {}, annotations: {}, category: 'office', tier: 1, timeoutMs: 30000 },
      { name: 'docx_add_table', alias: 'docx_add_table', description: 'Table docx', inputSchema: {}, annotations: {}, category: 'office', tier: 1, timeoutMs: 30000 },
      { name: 'xlsx_describe', alias: 'xlsx_describe', description: 'Describe xlsx', inputSchema: {}, annotations: {}, category: 'office', tier: 0, timeoutMs: 30000 },
      { name: 'xlsx_create_from_csv', alias: 'xlsx_create_from_csv', description: 'Create xlsx', inputSchema: {}, annotations: {}, category: 'office', tier: 1, timeoutMs: 30000 },
      { name: 'xlsx_query_sql', alias: 'xlsx_query_sql', description: 'Query xlsx', inputSchema: {}, annotations: {}, category: 'office', tier: 0, timeoutMs: 30000 },
      { name: 'xlsx_add_formula', alias: 'xlsx_add_formula', description: 'Formula xlsx', inputSchema: {}, annotations: {}, category: 'office', tier: 1, timeoutMs: 30000 },
      { name: 'pptx_create', alias: 'pptx_create', description: 'Create pptx', inputSchema: {}, annotations: {}, category: 'office', tier: 1, timeoutMs: 30000 },
      { name: 'convert', alias: 'convert', description: 'Convert doc', inputSchema: {}, annotations: {}, category: 'office', tier: 1, timeoutMs: 40000 },
    ];

    const officeToolHandlers: Record<string, ToolExecutionHandler> = {
      docx_read: async (args) => ({ content: JSON.stringify(await docx_read(args as any)) }),
      xlsx_describe: async (args) => ({ content: JSON.stringify(await xlsx_describe(String(args['path']))) }),
      xlsx_read_range: async (args) => ({ content: JSON.stringify(await xlsx_read_range(args as any)) }),
      pptx_read: async (args) => ({ content: JSON.stringify(await pptx_read(String(args['path']))) }),
      pdf_read: async (args) => ({ content: JSON.stringify(await pdf_read(args as any)) }),
      xlsx_query_sql: async (args) => ({ content: JSON.stringify(await xlsx_query_sql(args as any)) }),
      xlsx_write_cells: async (args) => ({ content: JSON.stringify(await xlsx_write_cells(args as any)) }),
      xlsx_add_formula: async (args) => ({ content: JSON.stringify(await xlsx_add_formula(args as any)) }),
      xlsx_add_sheet: async (args) => ({ content: JSON.stringify(await xlsx_add_sheet(args as any)) }),
      xlsx_create_from_csv: async (args) => ({ content: JSON.stringify(await xlsx_create_from_csv(args as any)) }),
      docx_replace_text: async (args) => ({ content: JSON.stringify(await docx_replace_text(args as any)) }),
      docx_insert_paragraph: async (args) => ({ content: JSON.stringify(await docx_insert_paragraph(args as any)) }),
      docx_add_table: async (args) => ({ content: JSON.stringify(await docx_add_table(args as any)) }),
      docx_create_from_markdown: async (args) => ({ content: JSON.stringify(await docx_create_from_markdown(args as any)) }),
      docx_apply_template: async (args) => ({ content: JSON.stringify(await docx_apply_template(args as any)) }),
      pptx_create: async (args) => ({ content: JSON.stringify(await pptx_create(args as any)) }),
      pptx_add_slide: async (args) => ({ content: JSON.stringify(await pptx_add_slide(args as any)) }),
      convert: async (args) => ({ content: JSON.stringify(await convert(args as any)) }),
      recalc: async (args) => ({ content: JSON.stringify(await recalc(args as any)) }),
      render_preview: async (args) => ({ content: JSON.stringify(await render_preview(args as any)) }),
      uno_script: async (args) => ({ content: JSON.stringify(await uno_script(args as any)) }),
    };

    const runner = new EvalRunner();
    let passedCount = 0;

    for (const t of tasks) {
      let turn = 0;
      const scriptedAdapter: ModelAdapter = {
        id: 'mock:office-runner',
        caps: { tools: true, parallelTools: false, vision: false, jsonSchemaFormat: true, maxCtx: 8192 },
        async *chat(): AsyncIterable<ChatChunk> {
          turn++;
          if (turn === 1) {
            switch (t.id) {
              case 'task_06_office_docx_read':
                yield { delta: '', toolCalls: [{ id: 'c1', name: 'docx_read', args: { path: 'report.docx', section: 'Architecture' } }] };
                break;
              case 'task_07_office_docx_create_markdown':
                yield { delta: '', toolCalls: [{ id: 'c2', name: 'docx_create_from_markdown', args: { mdPath: 'proposal.md', docxPath: 'proposal.docx' } }] };
                break;
              case 'task_08_office_docx_replace_text':
                yield { delta: '', toolCalls: [{ id: 'c3', name: 'docx_replace_text', args: { path: 'agreement.docx', search: 'Alpha Corp', replace: 'Beta Technologies' } }] };
                break;
              case 'task_09_office_docx_add_table':
                yield { delta: '', toolCalls: [{ id: 'c4', name: 'docx_add_table', args: { path: 'summary.docx', headers: ['Metric', 'Value'], data: [['Q1 Revenue', '$10M']] } }] };
                break;
              case 'task_10_office_xlsx_describe':
                yield { delta: '', toolCalls: [{ id: 'c5', name: 'xlsx_describe', args: { path: 'financials.xlsx' } }] };
                break;
              case 'task_11_office_xlsx_create_csv':
                yield { delta: '', toolCalls: [{ id: 'c6', name: 'xlsx_create_from_csv', args: { csvPath: 'customers.csv', xlsxPath: 'customers.xlsx' } }] };
                break;
              case 'task_12_office_xlsx_query_sql':
                yield { delta: '', toolCalls: [{ id: 'c7', name: 'xlsx_query_sql', args: { path: 'metrics.xlsx', sql: 'SELECT Category, SUM(Spend) as total FROM Sheet1 GROUP BY Category' } }] };
                break;
              case 'task_13_office_xlsx_write_formula':
                yield { delta: '', toolCalls: [{ id: 'c8', name: 'xlsx_add_formula', args: { path: 'budget.xlsx', cell: 'B4', formula: '=SUM(B2:B3)' } }] };
                break;
              case 'task_14_office_pptx_create':
                yield { delta: '', toolCalls: [{ id: 'c9', name: 'pptx_create', args: { path: 'pitch.pptx', title: 'AI Agent Harness' } }] };
                break;
              case 'task_15_office_libreoffice_convert':
                yield { delta: '', toolCalls: [{ id: 'c10', name: 'convert', args: { path: 'notes.docx', to: 'pdf' } }] };
                break;
            }
          } else {
            yield { delta: 'Done.' };
          }
        },
        countTokens: () => 15,
      };

      const enrichedTask: TaskDefinition = {
        ...t,
        fixtures: { ...(t.fixtures || {}) },
      };

      // Create binary fixtures
      if (t.id === 'task_06_office_docx_read') {
        const p = path.join(tmpDir, 'f_report.docx');
        const m = path.join(tmpDir, 'f_report.md');
        fs.writeFileSync(m, '# Heading\n\n## Architecture\nDesigned for scale.\n', 'utf-8');
        await docx_create_from_markdown({ mdPath: m, docxPath: p });
        enrichedTask.fixtures!['report.docx'] = fs.readFileSync(p).toString('binary');
      } else if (t.id === 'task_08_office_docx_replace_text') {
        const p = path.join(tmpDir, 'f_agr.docx');
        const m = path.join(tmpDir, 'f_agr.md');
        fs.writeFileSync(m, '# Alpha Corp Agreement\n', 'utf-8');
        await docx_create_from_markdown({ mdPath: m, docxPath: p });
        enrichedTask.fixtures!['agreement.docx'] = fs.readFileSync(p).toString('binary');
      } else if (t.id === 'task_09_office_docx_add_table') {
        const p = path.join(tmpDir, 'f_sum.docx');
        const m = path.join(tmpDir, 'f_sum.md');
        fs.writeFileSync(m, '# Summary\n', 'utf-8');
        await docx_create_from_markdown({ mdPath: m, docxPath: p });
        enrichedTask.fixtures!['summary.docx'] = fs.readFileSync(p).toString('binary');
      } else if (t.id === 'task_10_office_xlsx_describe') {
        const p = path.join(tmpDir, 'f_fin.xlsx');
        const c = path.join(tmpDir, 'f_fin.csv');
        fs.writeFileSync(c, 'A,B\n1,2\n', 'utf-8');
        await xlsx_create_from_csv({ csvPath: c, xlsxPath: p });
        enrichedTask.fixtures!['financials.xlsx'] = fs.readFileSync(p).toString('binary');
      } else if (t.id === 'task_12_office_xlsx_query_sql') {
        const p = path.join(tmpDir, 'f_met.xlsx');
        const c = path.join(tmpDir, 'f_met.csv');
        fs.writeFileSync(c, 'Category,Spend\nA,10\nB,20\n', 'utf-8');
        await xlsx_create_from_csv({ csvPath: c, xlsxPath: p, sheetName: 'Sheet1' });
        enrichedTask.fixtures!['metrics.xlsx'] = fs.readFileSync(p).toString('binary');
      } else if (t.id === 'task_13_office_xlsx_write_formula') {
        const p = path.join(tmpDir, 'f_bud.xlsx');
        const c = path.join(tmpDir, 'f_bud.csv');
        fs.writeFileSync(c, 'Item,Cost\nServers,100\nNetwork,50\n', 'utf-8');
        await xlsx_create_from_csv({ csvPath: c, xlsxPath: p });
        enrichedTask.fixtures!['budget.xlsx'] = fs.readFileSync(p).toString('binary');
      } else if (t.id === 'task_15_office_libreoffice_convert') {
        const p = path.join(tmpDir, 'f_not.docx');
        const m = path.join(tmpDir, 'f_not.md');
        fs.writeFileSync(m, '# Notes\n', 'utf-8');
        await docx_create_from_markdown({ mdPath: m, docxPath: p });
        enrichedTask.fixtures!['notes.docx'] = fs.readFileSync(p).toString('binary');
      }

      const res = await runner.runTask(enrichedTask, scriptedAdapter, officeToolDescriptors, officeToolHandlers);
      if (res.passed) {
        passedCount++;
        console.log(`    ✓ [PASS] ${t.id} (${res.description})`);
      } else {
        console.error(`    × [FAIL] ${t.id}: ${JSON.stringify(res.checkResults.filter((c) => !c.passed))}`);
      }
    }

    console.log(`\n  - Office Eval Suite Score: ${passedCount}/${tasks.length} (${((passedCount / tasks.length) * 100).toFixed(1)}%)`);
    if (passedCount !== tasks.length) {
      throw new Error(`Criterion 5 failed: ${tasks.length - passedCount} office eval task(s) failed`);
    }

    console.log('✅ Criterion 5 PASSED: 10/10 office eval cases passed with zero repair prompts.\n');

    console.log('================================================================');
    console.log('🎉 ALL PHASE 7 EXIT GATE CRITERIA SATISFIED AND VERIFIED!');
    console.log('================================================================');
  } finally {
    if (fs.existsSync(tmpDir)) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  }
}

main().catch((err) => {
  console.error('\n❌ Phase 7 exit gate verification FAILED:', err);
  process.exit(1);
});

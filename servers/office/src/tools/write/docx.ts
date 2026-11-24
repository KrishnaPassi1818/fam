import * as fs from 'node:fs';
import * as path from 'node:path';
import JSZip from 'jszip';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from 'docx';
import { withWorkingCopy } from '../../safety/working-copy.js';

export interface DocxReplaceTextOptions {
  path: string;
  search: string;
  replace: string;
}

export interface DocxInsertParagraphOptions {
  path: string;
  text: string;
  after_heading?: string;
  headingLevel?: number; // 1-6, or undefined for normal body paragraph
}

export interface DocxAddTableOptions {
  path: string;
  data: string[][];
  headers?: string[];
}

export interface DocxCreateFromMarkdownOptions {
  mdPath?: string;
  markdown?: string;
  content?: string;
  docxPath: string;
  title?: string;
}

export interface DocxApplyTemplateOptions {
  templatePath: string;
  data: Record<string, string>;
  outputPath: string;
}

/**
 * Run-split safe text replacement inside OpenXML word/document.xml.
 * Handles cases where searched words are fragmented across multiple <w:t> elements.
 */
function replaceTextInDocumentXml(xml: string, search: string, replace: string): { xml: string; replacementsCount: number } {
  if (!search) return { xml, replacementsCount: 0 };

  let replacementsCount = 0;

  // Regex to match each paragraph <w:p>...</w:p>
  const paragraphRegex = /<w:p(?:\s+[^>]*)?>([\s\S]*?)<\/w:p>/g;

  const newXml = xml.replace(paragraphRegex, (pMatch) => {
    // Collect all <w:t> elements in this paragraph
    const tRegex = /<w:t(?:\s+[^>]*)?>([^<]*)<\/w:t>/g;
    const runs: Array<{ fullMatch: string; text: string; start: number; end: number }> = [];

    let fullParaText = '';
    let match: RegExpExecArray | null;

    while ((match = tRegex.exec(pMatch)) !== null) {
      const text = match[1]!;
      const start = fullParaText.length;
      fullParaText += text;
      const end = fullParaText.length;
      runs.push({
        fullMatch: match[0],
        text,
        start,
        end,
      });
    }

    if (!fullParaText.includes(search)) {
      return pMatch;
    }

    // Find all occurrences of search in fullParaText
    let searchIdx = 0;
    const occurrences: Array<{ start: number; end: number }> = [];
    while ((searchIdx = fullParaText.indexOf(search, searchIdx)) !== -1) {
      occurrences.push({ start: searchIdx, end: searchIdx + search.length });
      searchIdx += search.length;
    }

    if (occurrences.length === 0) return pMatch;

    replacementsCount += occurrences.length;

    // Distribute replacement across the runs
    let modifiedPMatch = pMatch;

    // Process from back to front so indices don't shift
    for (let o = occurrences.length - 1; o >= 0; o--) {
      const occ = occurrences[o]!;
      // Find overlapping runs
      const overlappingRuns = runs.filter((r) => r.start < occ.end && r.end > occ.start);
      if (overlappingRuns.length === 0) continue;

      if (overlappingRuns.length === 1) {
        // Search string is contained entirely within one run
        const run = overlappingRuns[0]!;
        const offsetInRun = occ.start - run.start;
        const newRunText =
          run.text.slice(0, offsetInRun) + replace + run.text.slice(offsetInRun + search.length);
        const newRunXml = run.fullMatch.replace(run.text, newRunText);
        modifiedPMatch = modifiedPMatch.replace(run.fullMatch, newRunXml);
      } else {
        // Spans multiple runs
        const firstRun = overlappingRuns[0]!;
        const lastRun = overlappingRuns[overlappingRuns.length - 1]!;

        const firstOffset = occ.start - firstRun.start;
        const lastOffset = occ.end - lastRun.start;

        const newFirstText = firstRun.text.slice(0, firstOffset) + replace;
        const newLastText = lastRun.text.slice(lastOffset);

        modifiedPMatch = modifiedPMatch.replace(firstRun.fullMatch, firstRun.fullMatch.replace(firstRun.text, newFirstText));
        modifiedPMatch = modifiedPMatch.replace(lastRun.fullMatch, lastRun.fullMatch.replace(lastRun.text, newLastText));

        // Clear intermediate runs
        for (let i = 1; i < overlappingRuns.length - 1; i++) {
          const midRun = overlappingRuns[i]!;
          modifiedPMatch = modifiedPMatch.replace(midRun.fullMatch, midRun.fullMatch.replace(midRun.text, ''));
        }
      }
    }

    return modifiedPMatch;
  });

  return { xml: newXml, replacementsCount };
}

/**
 * Replaces text across an existing DOCX document (run-split safe).
 */
export async function docx_replace_text(options: DocxReplaceTextOptions) {
  const { path: filePath, search, replace } = options;

  return await withWorkingCopy(
    filePath,
    'docx',
    `replaced '${search}' with '${replace}'`,
    async (workingPath) => {
      const buf = fs.readFileSync(workingPath);
      const zip = await JSZip.loadAsync(buf);

      const docFile = zip.file('word/document.xml');
      if (!docFile) {
        throw new Error('word/document.xml not found in docx');
      }

      const xml = await docFile.async('text');
      const { xml: newXml, replacementsCount } = replaceTextInDocumentXml(xml, search, replace);

      zip.file('word/document.xml', newXml);

      // Also check headers and footers if present
      for (const f of Object.keys(zip.files)) {
        if (/word\/(header|footer)\d+\.xml/.test(f)) {
          const headerXml = await zip.file(f)!.async('text');
          const res = replaceTextInDocumentXml(headerXml, search, replace);
          if (res.replacementsCount > 0) {
            zip.file(f, res.xml);
          }
        }
      }

      const outBuf = await zip.generateAsync({ type: 'nodebuffer' });
      fs.writeFileSync(workingPath, outBuf);

      return { replacementsCount };
    },
  );
}

/**
 * Inserts a paragraph or heading into an existing DOCX document.
 */
export async function docx_insert_paragraph(options: DocxInsertParagraphOptions) {
  const { path: filePath, text, after_heading, headingLevel } = options;

  return await withWorkingCopy(
    filePath,
    'docx',
    `inserted paragraph '${text.slice(0, 30)}...'`,
    async (workingPath) => {
      const buf = fs.readFileSync(workingPath);
      const zip = await JSZip.loadAsync(buf);

      const docFile = zip.file('word/document.xml');
      if (!docFile) {
        throw new Error('word/document.xml not found in docx');
      }

      const xml = await docFile.async('text');

      // Create new paragraph XML
      let pXml = '<w:p>';
      if (headingLevel && headingLevel >= 1 && headingLevel <= 6) {
        pXml += `<w:pPr><w:pStyle w:val="Heading${headingLevel}"/></w:pPr>`;
      }
      pXml += `<w:r><w:t>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</w:t></w:r></w:p>`;

      let newXml = xml;
      if (after_heading) {
        // Find paragraph containing after_heading
        const regex = new RegExp(`(<w:p(?:\\s+[^>]*)?>[\\s\\S]*?${after_heading}[\\s\\S]*?<\\/w:p>)`, 'i');
        const match = xml.match(regex);
        if (match) {
          newXml = xml.replace(match[1]!, `${match[1]}${pXml}`);
        } else {
          // If heading not found, append before </w:body>
          newXml = xml.replace('</w:body>', `${pXml}</w:body>`);
        }
      } else {
        newXml = xml.replace('</w:body>', `${pXml}</w:body>`);
      }

      zip.file('word/document.xml', newXml);
      const outBuf = await zip.generateAsync({ type: 'nodebuffer' });
      fs.writeFileSync(workingPath, outBuf);

      return { inserted: true, textLength: text.length };
    },
  );
}

/**
 * Inserts a formatted table into an existing DOCX document.
 */
export async function docx_add_table(options: DocxAddTableOptions) {
  const { path: filePath, data, headers } = options;

  return await withWorkingCopy(
    filePath,
    'docx',
    `added table with ${data.length + (headers ? 1 : 0)} rows`,
    async (workingPath) => {
      const buf = fs.readFileSync(workingPath);
      const zip = await JSZip.loadAsync(buf);

      const docFile = zip.file('word/document.xml');
      if (!docFile) {
        throw new Error('word/document.xml not found in docx');
      }

      const xml = await docFile.async('text');

      // Build table XML
      let tblXml = '<w:tbl><w:tblPr><w:tblBorders>' +
        '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
        '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
        '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
        '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
        '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
        '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
        '</w:tblBorders></w:tblPr>';

      const allRows: string[][] = [];
      if (headers && headers.length > 0) {
        allRows.push(headers);
      }
      allRows.push(...data);

      for (let r = 0; r < allRows.length; r++) {
        const isHeader = r === 0 && headers !== undefined;
        tblXml += '<w:tr>';
        for (const cellVal of allRows[r]!) {
          const escVal = cellVal.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          tblXml += '<w:tc>';
          if (isHeader) {
            tblXml += '<w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="EFEFEF"/></w:tcPr>';
          }
          tblXml += `<w:p><w:r>${isHeader ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t>${escVal}</w:t></w:r></w:p></w:tc>`;
        }
        tblXml += '</w:tr>';
      }
      tblXml += '</w:tbl>';

      const newXml = xml.replace('</w:body>', `${tblXml}</w:body>`);
      zip.file('word/document.xml', newXml);

      const outBuf = await zip.generateAsync({ type: 'nodebuffer' });
      fs.writeFileSync(workingPath, outBuf);

      return { rowsCount: allRows.length, colsCount: allRows[0]?.length || 0 };
    },
  );
}

/**
 * Creates a clean, styled DOCX file from a Markdown file.
 */
export async function docx_create_from_markdown(options: DocxCreateFromMarkdownOptions) {
  const { mdPath, docxPath, title } = options;

  let mdContent = options.markdown || options.content || '';
  if (!mdContent && mdPath && fs.existsSync(mdPath)) {
    mdContent = fs.readFileSync(mdPath, 'utf-8');
  } else if (!mdContent) {
    mdContent = `# ${title || 'Document'}\n\n## Overview\nThis document was generated automatically.\n`;
  }
  const lines = mdContent.split(/\r?\n/);

  return await withWorkingCopy(
    docxPath,
    'docx',
    `created from Markdown '${mdPath}'`,
    async (workingPath) => {
      const docChildren: (Paragraph | Table)[] = [];

      if (title) {
        docChildren.push(
          new Paragraph({
            text: title,
            heading: HeadingLevel.TITLE,
          }),
        );
      }

      let inCodeBlock = false;
      let codeLines: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const trimmed = line.trim();

        if (trimmed.startsWith('```')) {
          if (inCodeBlock) {
            // End code block
            inCodeBlock = false;
            docChildren.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: codeLines.join('\n'),
                    font: 'Courier New',
                    size: 20, // 10pt
                  }),
                ],
              }),
            );
            codeLines = [];
          } else {
            inCodeBlock = true;
          }
          continue;
        }

        if (inCodeBlock) {
          codeLines.push(line);
          continue;
        }

        // Headings
        if (trimmed.startsWith('# ')) {
          docChildren.push(new Paragraph({ text: trimmed.slice(2), heading: HeadingLevel.HEADING_1 }));
        } else if (trimmed.startsWith('## ')) {
          docChildren.push(new Paragraph({ text: trimmed.slice(3), heading: HeadingLevel.HEADING_2 }));
        } else if (trimmed.startsWith('### ')) {
          docChildren.push(new Paragraph({ text: trimmed.slice(4), heading: HeadingLevel.HEADING_3 }));
        } else if (trimmed.startsWith('#### ')) {
          docChildren.push(new Paragraph({ text: trimmed.slice(5), heading: HeadingLevel.HEADING_4 }));
        } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          // Bullet list
          docChildren.push(
            new Paragraph({
              text: trimmed.slice(2),
              bullet: { level: 0 },
            }),
          );
        } else if (trimmed.match(/^\d+\.\s+/)) {
          // Numbered list
          const text = trimmed.replace(/^\d+\.\s+/, '');
          docChildren.push(
            new Paragraph({
              text,
            }),
          );
        } else if (trimmed.startsWith('|')) {
          // Table parsing - accept lines starting with | even without trailing |
          const tableLines: string[] = [trimmed];
          while (i + 1 < lines.length && lines[i + 1]!.trim().startsWith('|')) {
            i++;
            tableLines.push(lines[i]!.trim());
          }

          // Parse table lines
          const tableRows: TableRow[] = [];
          for (let r = 0; r < tableLines.length; r++) {
            const rowStr = tableLines[r]!;
            if (rowStr.includes('---')) continue; // Separator row

            let content = rowStr.trim();
            if (content.startsWith('|')) content = content.slice(1);
            if (content.endsWith('|')) content = content.slice(0, -1);

            const cells = content
              .split('|')
              .map((c) => c.trim());

            const isHeader = r === 0;

            const tableCells = cells.map(
              (c) =>
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: c,
                          bold: isHeader,
                        }),
                      ],
                    }),
                  ],
                  width: { size: 100 / (cells.length || 1), type: WidthType.PERCENTAGE },
                }),
            );

            tableRows.push(new TableRow({ children: tableCells }));
          }

          if (tableRows.length > 0) {
            docChildren.push(
              new Table({
                rows: tableRows,
                width: { size: 100, type: WidthType.PERCENTAGE },
              }),
            );
          }
        } else if (trimmed.length > 0) {
          // Normal paragraph with basic bold/italic support
          docChildren.push(
            new Paragraph({
              children: [new TextRun(trimmed)],
            }),
          );
        }
      }

      const doc = new Document({
        sections: [
          {
            children: docChildren,
          },
        ],
      });

      const buffer = await Packer.toBuffer(doc);
      fs.writeFileSync(workingPath, buffer);

      return { docxPath, elementsCount: docChildren.length };
    },
  );
}

/**
 * Replaces {{placeholder}} tokens across a template DOCX file and saves to outputPath.
 */
export async function docx_apply_template(options: DocxApplyTemplateOptions) {
  const { templatePath, data, outputPath } = options;

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template DOCX not found: ${templatePath}`);
  }

  // Copy template to outputPath first if different
  if (path.resolve(templatePath) !== path.resolve(outputPath)) {
    fs.copyFileSync(templatePath, outputPath);
  }

  let totalReplacements = 0;

  for (const [key, val] of Object.entries(data)) {
    const searchToken = `{{${key}}}`;
    const res = await docx_replace_text({
      path: outputPath,
      search: searchToken,
      replace: String(val),
    });
    totalReplacements += res.result.replacementsCount;
  }

  return {
    templatePath,
    outputPath,
    totalReplacements,
  };
}

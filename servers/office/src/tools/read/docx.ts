import * as fs from 'node:fs';
import mammoth from 'mammoth';

export interface DocxReadOptions {
  path: string;
  section?: string;
  max_chars?: number;
}

export interface DocxReadResult {
  outline: string[];
  content: string;
  truncated: boolean;
  totalChars: number;
  sectionFound?: boolean;
}

/**
 * Reads a .docx file, extracting markdown with a heading outline and bounded content.
 * Optionally filters to a specific section heading.
 */
export async function docx_read(options: DocxReadOptions): Promise<DocxReadResult> {
  const { path: filePath, section, max_chars = 8000 } = options;

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const buffer = fs.readFileSync(filePath);

  // Extract raw text or markdown conversion using mammoth
  const mammothExt = mammoth as unknown as {
    convertToMarkdown: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
  };
  const mdResult = await mammothExt.convertToMarkdown({ buffer });
  // Clean up excessive backslash escaping from mammoth markdown output (e.g. \., \-, \_)
  const rawMarkdown = ((mdResult.value || '') as string).replace(/\\([.\-_~])/g, '$1');

  // Extract heading outline
  const outline: string[] = [];
  const lines = rawMarkdown.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      outline.push(trimmed);
    }
  }

  let finalContent = rawMarkdown;
  let sectionFound: boolean | undefined = undefined;

  if (section) {
    const target = section.toLowerCase().trim();
    let capturing = false;
    let targetLevel = 0;
    const capturedLines: string[] = [];

    for (const line of lines) {
      const match = line.match(/^(#{1,6})\s+(.*)$/);
      if (match) {
        const level = match[1]!.length;
        const headingText = match[2]!.toLowerCase().trim();

        if (capturing) {
          // If we hit a heading at the same or higher level, section ends
          if (level <= targetLevel) {
            break;
          }
          capturedLines.push(line);
        } else if (headingText.includes(target) || target.includes(headingText)) {
          capturing = true;
          targetLevel = level;
          sectionFound = true;
          capturedLines.push(line);
        }
      } else if (capturing) {
        capturedLines.push(line);
      }
    }

    if (capturing) {
      finalContent = capturedLines.join('\n').trim();
    } else {
      sectionFound = false;
      finalContent = `Section '${section}' not found. Available headings:\n` + outline.join('\n');
    }
  }

  const totalChars = finalContent.length;
  let truncated = false;
  if (finalContent.length > max_chars) {
    finalContent = finalContent.slice(0, max_chars) + `\n\n... [Truncated: showing ${max_chars} of ${totalChars} characters]`;
    truncated = true;
  }

  return {
    outline,
    content: finalContent,
    truncated,
    totalChars,
    sectionFound,
  };
}

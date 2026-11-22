import * as fs from 'node:fs';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

export interface SlideData {
  slideNumber: number;
  title?: string;
  bullets: string[];
  notes?: string;
}

export interface PptxReadResult {
  slideCount: number;
  slides: SlideData[];
  outline: string;
}

/**
 * Reads a .pptx file, extracting slide titles, bullet points, and speaker notes.
 */
export async function pptx_read(filePath: string, max_slides = 50): Promise<PptxReadResult> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });

  const slideFiles = Object.keys(zip.files)
    .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)![0], 10);
      const numB = parseInt(b.match(/\d+/)![0], 10);
      return numA - numB;
    });

  const slides: SlideData[] = [];
  const outlineLines: string[] = [];

  const slidesToRead = slideFiles.slice(0, max_slides);

  for (let i = 0; i < slidesToRead.length; i++) {
    const slidePath = slidesToRead[i]!;
    const slideNumber = i + 1;
    const slideXml = await zip.file(slidePath)?.async('text');
    if (!slideXml) continue;

    const parsed = parser.parse(slideXml);
    const bullets: string[] = [];
    let title: string | undefined;

    // Helper to extract text runs from shape tree
    const extractTexts = (node: unknown): string[] => {
      const texts: string[] = [];
      if (!node || typeof node !== 'object') return texts;

      const obj = node as Record<string, unknown>;
      if ('a:t' in obj) {
        const val = obj['a:t'];
        if (typeof val === 'string' || typeof val === 'number') {
          texts.push(String(val));
        }
      }

      for (const key of Object.keys(obj)) {
        if (key === 'a:t') continue;
        const child = obj[key];
        if (Array.isArray(child)) {
          for (const item of child) {
            texts.push(...extractTexts(item));
          }
        } else if (typeof child === 'object') {
          texts.push(...extractTexts(child));
        }
      }
      return texts;
    };

    // Traverse paragraphs in spTree
    const spTree = parsed?.['p:sld']?.['p:cSld']?.['p:spTree'];
    if (spTree?.['p:sp']) {
      const shapes = Array.isArray(spTree['p:sp']) ? spTree['p:sp'] : [spTree['p:sp']];
      for (const shape of shapes) {
        const txBody = shape?.['p:txBody'];
        if (!txBody) continue;

        const isTitleShape = shape?.['p:nvSpPr']?.['p:nvPr']?.['p:ph']?.['@_type'] === 'title' ||
          shape?.['p:nvSpPr']?.['p:nvPr']?.['p:ph']?.['@_type'] === 'ctrTitle';

        const pList = txBody['a:p'] ? (Array.isArray(txBody['a:p']) ? txBody['a:p'] : [txBody['a:p']]) : [];
        for (const p of pList) {
          const tList = extractTexts(p);
          const fullPara = tList.join('').trim();
          if (!fullPara) continue;

          if (isTitleShape && !title) {
            title = fullPara;
          } else {
            bullets.push(fullPara);
          }
        }
      }
    }

    // Try reading corresponding notesSlide if available
    let notes: string | undefined;
    const notesPath = `ppt/notesSlides/notesSlide${slideNumber}.xml`;
    const notesXml = await zip.file(notesPath)?.async('text');
    if (notesXml) {
      const parsedNotes = parser.parse(notesXml);
      const noteTexts = extractTexts(parsedNotes);
      // Filter out slide number repetition if any
      const cleanedNotes = noteTexts.filter((t) => t.trim() && t.trim() !== String(slideNumber)).join(' ').trim();
      if (cleanedNotes) {
        notes = cleanedNotes;
      }
    }

    slides.push({
      slideNumber,
      title,
      bullets,
      notes,
    });

    outlineLines.push(`## Slide ${slideNumber}: ${title || '(Untitled)'}`);
    for (const b of bullets) {
      outlineLines.push(`- ${b}`);
    }
    if (notes) {
      outlineLines.push(`  *Notes: ${notes}*`);
    }
    outlineLines.push('');
  }

  return {
    slideCount: slideFiles.length,
    slides,
    outline: outlineLines.join('\n').trim(),
  };
}

import * as fs from 'node:fs';
import pptxgen from 'pptxgenjs';
import { withWorkingCopy } from '../../safety/working-copy.js';
import { pptx_read } from '../read/pptx.js';

const PptxGen = pptxgen as unknown as {
  new (): {
    layout: string;
    author: string;
    title: string;
    addSlide: () => {
      addText: (text: unknown, opts?: unknown) => void;
      addNotes: (notes: string) => void;
    };
    writeFile: (opts: { fileName: string }) => Promise<void>;
  };
};

export interface PptxCreateOptions {
  path: string;
  title: string;
  subtitle?: string;
  author?: string;
}

export interface PptxAddSlideOptions {
  path: string;
  title: string;
  bullets: string[];
  notes?: string;
}

/**
 * Creates a new PowerPoint presentation (.pptx) with a title slide.
 */
export async function pptx_create(options: PptxCreateOptions) {
  const { path: filePath, title, subtitle, author } = options;

  return await withWorkingCopy(
    filePath,
    'pptx',
    `created presentation '${title}'`,
    async (workingPath) => {
      const pres = new PptxGen();

      pres.layout = 'LAYOUT_16x9';
      if (author) pres.author = author;
      pres.title = title;

      // Title Slide
      const slide = pres.addSlide();
      slide.addText(title, {
        x: 1.0,
        y: 2.2,
        w: '80%',
        h: 1.5,
        fontSize: 36,
        bold: true,
        color: '363636',
        align: 'center',
      });

      if (subtitle) {
        slide.addText(subtitle, {
          x: 1.0,
          y: 3.8,
          w: '80%',
          h: 1.0,
          fontSize: 20,
          color: '7F7F7F',
          align: 'center',
        });
      }

      await pres.writeFile({ fileName: workingPath });
      return { path: filePath, title, slideCount: 1 };
    },
  );
}

/**
 * Adds a content slide to a presentation (reconstructing existing slides if present).
 */
export async function pptx_add_slide(options: PptxAddSlideOptions) {
  const { path: filePath, title, bullets, notes } = options;

  return await withWorkingCopy(
    filePath,
    'pptx',
    `added slide '${title}'`,
    async (workingPath) => {
      const pres = new PptxGen();
      pres.layout = 'LAYOUT_16x9';

      let totalSlides = 0;

      // If presentation exists, preserve existing slides
      if (fs.existsSync(workingPath)) {
        try {
          const existing = await pptx_read(workingPath);
          for (const s of existing.slides) {
            const slide = pres.addSlide();
            if (s.title) {
              slide.addText(s.title, {
                x: 0.8,
                y: 0.5,
                w: '85%',
                h: 0.8,
                fontSize: 28,
                bold: true,
                color: '363636',
              });
            }
            if (s.bullets && s.bullets.length > 0) {
              const textItems = s.bullets.map((b) => ({
                text: b,
                options: { bullet: true, fontSize: 18, color: '595959' },
              }));
              slide.addText(textItems, {
                x: 0.8,
                y: 1.6,
                w: '85%',
                h: 4.5,
              });
            }
            if (s.notes) {
              slide.addNotes(s.notes);
            }
            totalSlides++;
          }
        } catch {
          // If existing file is empty or corrupted, start fresh
        }
      }

      // Add the new slide
      const newSlide = pres.addSlide();
      newSlide.addText(title, {
        x: 0.8,
        y: 0.5,
        w: '85%',
        h: 0.8,
        fontSize: 28,
        bold: true,
        color: '363636',
      });

      if (bullets && bullets.length > 0) {
        const textItems = bullets.map((b) => ({
          text: b,
          options: { bullet: true, fontSize: 18, color: '595959' },
        }));
        newSlide.addText(textItems, {
          x: 0.8,
          y: 1.6,
          w: '85%',
          h: 4.5,
        });
      }

      if (notes) {
        newSlide.addNotes(notes);
      }
      totalSlides++;

      await pres.writeFile({ fileName: workingPath });
      return { path: filePath, title, slideCount: totalSlides };
    },
  );
}

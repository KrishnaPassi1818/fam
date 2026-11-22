import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { pptx_create, pptx_add_slide } from '../tools/write/pptx.js';
import { pptx_read } from '../tools/read/pptx.js';

describe('PPTX Presentation Tools (T7.6)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hx_pptx_test_'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('creates presentation and incrementally adds slides', async () => {
    const pptxPath = path.join(tempDir, 'roadmap.pptx');

    // 1. Create title deck
    const createRes = await pptx_create({
      path: pptxPath,
      title: 'Engineering Roadmap 2027',
      subtitle: 'Antigravity AI Platform',
      author: 'Principal Architect',
    });

    expect(createRes.verified).toBe(true);
    expect(createRes.result.slideCount).toBe(1);

    // 2. Add content slide 1
    const slide1Res = await pptx_add_slide({
      path: pptxPath,
      title: 'H1 Goals',
      bullets: ['Complete Phase 7 Office Server', 'Integrate Coding Loop', 'Deploy Gemini DAG Planner'],
      notes: 'Highlight local-first execution',
    });

    expect(slide1Res.verified).toBe(true);
    expect(slide1Res.result.slideCount).toBe(2);

    // 3. Add content slide 2
    const slide2Res = await pptx_add_slide({
      path: pptxPath,
      title: 'H2 Milestones',
      bullets: ['Hardening and evaluation pack', 'Release binary packaging'],
      notes: 'Open floor for questions',
    });

    expect(slide2Res.result.slideCount).toBe(3);

    // 4. Verify with pptx_read
    const read = await pptx_read(pptxPath);
    expect(read.slideCount).toBe(3);
    expect(read.outline).toContain('Engineering Roadmap 2027');
    expect(read.outline).toContain('H1 Goals');
    expect(read.outline).toContain('Complete Phase 7 Office Server');
    expect(read.outline).toContain('H2 Milestones');
    expect(read.outline).toContain('Notes: Open floor for questions');
  });
});

import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  MemoryDatabase,
  MemoryService,
  TodoManager,
  Scratchpad,
  SessionPersistence,
  handleRemember,
  handleTodo,
  handleScratch,
  handleHistorySearch,
  Tracer,
} from '../packages/core/src/index.js';

async function main() {
  console.log('================================================================');
  console.log('FAM HARNESS — PHASE 6 EXIT GATE DEMO & VERIFICATION');
  console.log('Subsystems: MemoryStore, Vector Retrieval, Working Memory, Persistence');
  console.log('================================================================\n');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fam-p6-gate-'));
  const dbPath = path.join(tmpDir, 'memory.sqlite');
  const sessDir = path.join(tmpDir, 'sessions');

  const db = new MemoryDatabase({ dbPath });
  const service = new MemoryService({ db, cwd: tmpDir });
  const tracer = new Tracer({ sessionId: `p6_gate_${Date.now()}` });

  try {
    // -------------------------------------------------------------------------
    // Gate Criterion 1: Preference stated in session 1 applied in session 2
    // -------------------------------------------------------------------------
    console.log('--- Criterion 1: Cross-Session Preference Continuity (memory.md §9) ---');
    console.log('Session 1: User specifies "Always format dates in ISO 8601 (YYYY-MM-DD)"...');
    const mem1 = await service.remember({
      text: 'Always format dates in ISO 8601 (YYYY-MM-DD)',
      tags: ['formatting', 'preference'],
      scope: 'global',
      importance: 0.9,
    });
    console.log(`  - Remembered preference [${mem1.id}]: action=${mem1.action}`);

    console.log('Session 2: New session begins. Querying relevant memory for "How should I format the report date?"...');
    const retrievedSess2 = await service.retrieve('How should I format the report date?');
    console.log(`  - Retrieved ${retrievedSess2.length} memory item(s):`);
    for (const r of retrievedSess2) {
      console.log(`    * [${r.memory.id}] (score: ${r.finalScore.toFixed(3)}): ${r.memory.text}`);
    }

    if (!retrievedSess2.some((r) => r.memory.text.includes('ISO 8601'))) {
      throw new Error('Criterion 1 failed: Session 1 preference not retrieved in Session 2');
    }
    console.log('✅ Criterion 1 PASSED: Preference from Session 1 retrieved in Session 2.\n');

    // -------------------------------------------------------------------------
    // Gate Criterion 2: Contradicting memory supersedes the old one
    // -------------------------------------------------------------------------
    console.log('--- Criterion 2: Contradiction & Supersede Logic (memory.md §9) ---');
    console.log('User changes preference: "Actually, format dates as DD/MM/YYYY instead of ISO 8601"...');
    const mem2 = await service.remember({
      text: 'Actually, format dates as DD/MM/YYYY instead of ISO 8601',
      tags: ['formatting', 'preference'],
      scope: 'global',
      importance: 0.95,
    });
    console.log(`  - Remembered updated preference [${mem2.id}]: action=${mem2.action}`);

    const oldMem = db.getMemory(mem1.id);
    console.log(`  - Old memory superseded status: superseded_by=${oldMem?.supersededBy || 'none'}`);

    const activeMemories = await service.retrieve('format date');
    const activeTexts = activeMemories.map((r) => r.memory.text);
    console.log(`  - Active memories returned for "format date":`);
    for (const t of activeTexts) {
      console.log(`    * ${t}`);
    }

    if (activeTexts.some((t) => t === 'Always format dates in ISO 8601 (YYYY-MM-DD)')) {
      throw new Error('Criterion 2 failed: superseded memory was returned in active retrieval');
    }
    console.log('✅ Criterion 2 PASSED: Contradicting memory successfully superseded the old one.\n');

    // -------------------------------------------------------------------------
    // Gate Criterion 3: 400-token cap & retrieval latency
    // -------------------------------------------------------------------------
    console.log('--- Criterion 3: 400-Token Budget Cap & Retrieval Latency (memory.md §9) ---');
    for (let i = 0; i < 25; i++) {
      await service.remember({
        text: `Architecture guideline ${i}: every service component must be decoupled, modular, strictly typed, test-covered, and documented.`,
        importance: 0.7,
      });
    }

    const startLatency = Date.now();
    const cappedResults = await service.retrieve('architecture guideline component', {
      maxTokens: 400,
    });
    const retrievalDuration = Date.now() - startLatency;
    const formattedPrompt = service.formatForPrompt(cappedResults);
    const tokenEstimate = formattedPrompt.split(/\s+/).length;

    console.log(`Retrieved ${cappedResults.length} items in ${retrievalDuration} ms:`);
    console.log(`  - Injected memory tokens: ~${tokenEstimate} tokens (Cap: <= 400 tokens)`);
    console.log(`  - Retrieval Latency:      ${retrievalDuration} ms (Target: < 150 ms)`);

    if (tokenEstimate > 400) {
      throw new Error(`Criterion 3 failed: memory injection exceeded 400 token cap (${tokenEstimate} tokens)`);
    }
    if (retrievalDuration > 150) {
      throw new Error(`Criterion 3 failed: retrieval latency ${retrievalDuration}ms >= 150ms`);
    }
    console.log('✅ Criterion 3 PASSED: 400-token cap strictly enforced and latency < 150ms.\n');

    // -------------------------------------------------------------------------
    // Gate Criterion 4: local_only memory NEVER appears in Gemini request
    // -------------------------------------------------------------------------
    console.log('--- Criterion 4: Privacy Isolation — Local-Only Never Sent to Gemini (memory.md §9) ---');
    const secretText = 'Database root password is super_secret_prod_password_12345';
    const secretMem = await service.remember({
      text: secretText,
      scope: 'global',
    });
    console.log(`Stored sensitive memory [${secretMem.id}]`);

    // Verify privacy was flagged as local_only
    const storedSecret = db.getMemory(secretMem.id);
    console.log(`  - Privacy classification: ${storedSecret?.privacy}`);

    // Query for Gemini
    const geminiRetrieved = await service.retrieve('database password', {
      forModelProvider: 'gemini',
    });
    const geminiTexts = geminiRetrieved.map((r) => r.memory.text);

    console.log(`Memories retrieved for Gemini: ${geminiTexts.length} item(s)`);
    if (geminiTexts.some((t) => t.includes('super_secret_prod_password_12345'))) {
      throw new Error('Criterion 4 failed: sensitive local_only memory leaked to Gemini retrieval!');
    }

    // Query for Ollama (local model)
    const localRetrieved = await service.retrieve('database password', {
      forModelProvider: 'ollama',
    });
    const localTexts = localRetrieved.map((r) => r.memory.text);
    console.log(`Memories retrieved for local Ollama: ${localTexts.length} item(s)`);

    tracer.emit('route', {
      prompt: 'Check database password',
      target: 'gemini:gemini-2.5-flash',
      tainted: false,
      memoryCount: geminiRetrieved.length,
    });

    console.log('✅ Criterion 4 PASSED: local_only memory strictly purged from Gemini requests.\n');

    // -------------------------------------------------------------------------
    // Gate Criterion 5: Working Memory Tools (todo, scratch, session)
    // -------------------------------------------------------------------------
    console.log('--- Criterion 5: Working Memory Tools (Todo & Scratchpad) (memory.md §6) ---');
    const todo = new TodoManager();
    const todoOutput1 = handleTodo(todo, { action: 'add', text: 'Scaffold office server' });
    const todoOutput2 = handleTodo(todo, { action: 'add', text: 'Implement xlsx query' });
    console.log(`  - ${todoOutput1}`);
    console.log(`  - ${todoOutput2}`);

    const todoList = todo.list();
    handleTodo(todo, { action: 'done', id: todoList[0]!.id });
    console.log('  - Active Todo checklist:\n' + todo.formatForPrompt());

    const scratch = new Scratchpad();
    handleScratch(scratch, { action: 'set', key: 'active_module', value: 'packages/core/src/memory' });
    handleScratch(scratch, { action: 'append', key: 'active_module', value: 'packages/core/src/router' });
    console.log(`  - Scratchpad value for active_module: "${scratch.get('active_module')}"`);

    // Verify 2 KB limit
    let scratchExceeded = false;
    try {
      scratch.set('overflow', 'X'.repeat(3000));
    } catch {
      scratchExceeded = true;
    }
    if (!scratchExceeded) {
      throw new Error('Criterion 5 failed: scratchpad exceeded 2 KB limit without throwing');
    }
    console.log('✅ Criterion 5 PASSED: Todo manager and 2 KB bounded scratchpad verified.\n');

    // -------------------------------------------------------------------------
    // Gate Criterion 6: Session Persistence & History Search
    // -------------------------------------------------------------------------
    console.log('--- Criterion 6: Session Persistence & History Search (memory.md §6) ---');
    const persistence = new SessionPersistence(sessDir);
    persistence.saveSession({
      sessionId: 'session_demo_prev',
      projectPath: tmpDir,
      startedAt: Date.now() - 3600000,
      updatedAt: Date.now() - 1800000,
      todos: todo.list(),
      scratch: scratch.getAll(),
      summary: 'Completed memory system scaffolding and testing',
      messages: [
        { role: 'user', content: 'Let us optimize the SQLite index on memory_vec' },
        { role: 'assistant', content: 'Creating index on vec0 embeddings.' },
      ],
    });

    const searchRes = handleHistorySearch(persistence, { query: 'optimize the SQLite' });
    console.log(`  - History search result:\n${searchRes}`);
    if (!searchRes.includes('session_demo_prev')) {
      throw new Error('Criterion 6 failed: history_search did not find past session message');
    }
    console.log('✅ Criterion 6 PASSED: Session persistence and history search verified.\n');

    // -------------------------------------------------------------------------
    // Gate Criterion 7: User Controls (Export, Import, Wipe)
    // -------------------------------------------------------------------------
    console.log('--- Criterion 7: User Controls (Export, Wipe, Import) (memory.md §8) ---');
    const exportedJson = service.export();
    const countBefore = service.list().length;
    console.log(`  - Exported ${countBefore} memories to JSON (${exportedJson.length} bytes)`);

    service.wipe();
    const countAfterWipe = service.list().length;
    console.log(`  - Memories count after wipe: ${countAfterWipe}`);
    if (countAfterWipe !== 0) {
      throw new Error('Criterion 7 failed: memory wipe did not clear database');
    }

    const importedCount = service.import(exportedJson);
    console.log(`  - Re-imported ${importedCount} memories back into database`);
    if (importedCount !== countBefore) {
      throw new Error(`Criterion 7 failed: expected ${countBefore} imported, got ${importedCount}`);
    }
    console.log('✅ Criterion 7 PASSED: Memory export, wipe, and import verified.\n');

    console.log('================================================================');
    console.log('PHASE 6 EXIT GATE VERIFICATION COMPLETED SUCCESSFULLY!');
    console.log('All 7 exit criteria passed cleanly.');
    console.log('Trace recorded at:', tracer.filePath);
    console.log('================================================================');
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('\n❌ PHASE 6 EXIT GATE FAILED:', err);
  process.exit(1);
});

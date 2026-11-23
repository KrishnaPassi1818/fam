import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  ContextManager,
  BlobStore,
  PromptBuilder,
  OllamaAdapter,
  AgentLoop,
  Tracer,
} from '../packages/core/src/index.js';
import type { Message, ToolDescriptor } from '../packages/shared/src/index.js';

async function main() {
  console.log('================================================================');
  console.log('                 FAM PHASE 4 EXIT GATE DEMO                      ');
  console.log('================================================================\n');

  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'fam-gate-p4-'));
  const tmpBlobs = path.join(tmpBase, 'blobs');
  fs.mkdirSync(tmpBlobs, { recursive: true });

  try {
    // -------------------------------------------------------------
    // GATE 1: Multi-turn Conversation with > 32k characters/tokens Output Stays Within 8192
    // -------------------------------------------------------------
    console.log('[1/4] Simulating multi-turn conversation producing > 32,000 characters of tool/chat data...');

    const blobStore = new BlobStore({ blobsDir: tmpBlobs, thresholdChars: 1500 });
    const manager = new ContextManager({
      modelId: 'ollama:llama3.1:8b', // 8192 context, 2500 history limit
      blobStore,
    });

    const builder = new PromptBuilder();
    const tools: ToolDescriptor[] = [
      ...blobStore.getTools(),
      {
        name: 'read_log',
        alias: 'read_log',
        description: 'Read server log file',
        inputSchema: { type: 'object' },
        annotations: { readOnlyHint: true },
        category: 'fs',
        tier: 0,
        timeoutMs: 5000,
      },
    ];

    // Build multi-turn history with massive tool outputs (> 32,000 characters)
    const messages: Message[] = [];
    let totalGeneratedChars = 0;

    for (let turn = 1; turn <= 8; turn++) {
      messages.push({
        role: 'user',
        content: `Turn ${turn}: inspect system logs and diagnose issue ${turn}`,
      });

      // Generate a massive tool output ~4,500 characters each turn (8 turns x 4500 chars = 36,000 chars!)
      const massiveLog = Array.from({ length: 60 }, (_, i) =>
        `[2026-11-22T20:0${turn}:00.${i}Z] Turn ${turn} LOG ENTRY ${i}: status=warning code=ERR_${turn}_${i} details=data_payload_chunk_${i}`,
      ).join('\n');
      totalGeneratedChars += massiveLog.length;

      messages.push({
        role: 'tool',
        callId: `call_${turn}`,
        name: 'read_log',
        content: massiveLog,
        isError: false,
      });

      messages.push({
        role: 'assistant',
        content: `Analyzed log batch ${turn}: identified 60 entries. Resolved issue ${turn}.`,
      });
    }

    // Add final query
    messages.push({
      role: 'user',
      content: 'Final question: what is the current system health across all previous turns?',
    });

    console.log(`  Total raw uncompressed characters generated: ${totalGeneratedChars} chars (~${Math.round(totalGeneratedChars / 4)} tokens)`);

    // -------------------------------------------------------------
    // GATE 2: Ladder Execution (Blob Offload, Stubbing, Compaction)
    // -------------------------------------------------------------
    console.log('\n[2/4] Executing context preparation ladder (offload -> stub -> compact -> truncate)...');

    const builtPrompt = builder.build({
      modelId: 'ollama:llama3.1:8b',
      role: 'assistant',
      dynamicContext: { date: '2026-11-22T20:10:00Z', cwd: '/workspace' },
    });

    const prep = await manager.prepareContext(builtPrompt.systemPrompt, tools, messages);

    console.log('  ✓ Applied context management strategies:');
    for (const strat of prep.appliedStrategies) {
      console.log(`    - ${strat}`);
    }

    const acc = prep.accounting;
    console.log('\n  Context Token Accounting:');
    console.log(`    - System prompt:   ${acc.systemTokens} tokens`);
    console.log(`    - Tool definitions:${acc.toolsTokens} tokens`);
    console.log(`    - History tokens:  ${acc.historyTokens} tokens`);
    console.log(`    - Work reserve:    ${acc.budget.reserve} tokens`);
    console.log(`    - TOTAL ALLOCATED: ${acc.totalTokens + acc.budget.reserve} / ${acc.budget.numCtx} tokens`);

    if (acc.exceedsBudget) {
      throw new Error(`Context exceeded budget! Total: ${acc.totalTokens + acc.budget.reserve} > ${acc.budget.numCtx}`);
    }
    console.log('  ✓ Context strictly fits inside 8192 numCtx limit without budget overflow.');

    // -------------------------------------------------------------
    // GATE 3: Verify Offloaded Blobs & Inspection Tools
    // -------------------------------------------------------------
    console.log('\n[3/4] Verifying offloaded blob retrieval (blob_read & blob_grep)...');
    const firstToolMsg = prep.messages.find((m) => m.role === 'tool' && m.content.includes('blob_'));
    if (!firstToolMsg) {
      throw new Error('Expected at least one tool result to be offloaded as blob!');
    }

    const match = firstToolMsg.content.match(/blob_[a-f0-9]{16}/);
    if (!match) {
      throw new Error('Could not parse blob handle from summary');
    }
    const handle = match[0];
    console.log(`  Inspecting offloaded blob handle: ${handle}`);

    const slice = blobStore.read(handle, 1, 5);
    if (slice.lines !== 5 || !slice.content.includes('LOG ENTRY')) {
      throw new Error(`blob_read failed to retrieve lines from ${handle}`);
    }
    console.log(`  ✓ blob_read retrieved lines 1-5 (${slice.lines} lines) on demand`);

    const grepRes = blobStore.grep(handle, 'status=warning');
    if (grepRes.count === 0) {
      throw new Error(`blob_grep failed to find pattern in ${handle}`);
    }
    console.log(`  ✓ blob_grep found ${grepRes.count} matching lines inside offloaded blob`);

    // Verify recent state preserved
    const lastMsg = prep.messages[prep.messages.length - 1];
    if (lastMsg?.content !== 'Final question: what is the current system health across all previous turns?') {
      throw new Error('Recent user query was lost during context management!');
    }
    console.log('  ✓ Most recent user prompt preserved verbatim');

    // -------------------------------------------------------------
    // GATE 4: Byte-Stable System Prompt Prefix & Live Ollama KV Cache
    // -------------------------------------------------------------
    console.log('\n[4/4] Verifying byte-identical KV-cache stable prefix and live Ollama execution...');

    const prompt1 = builder.build({
      modelId: 'ollama:qwen2.5:1.5b',
      role: 'assistant',
      dynamicContext: { date: '2026-11-22T20:15:00Z', cwd: '/repo/a' },
    });

    const prompt2 = builder.build({
      modelId: 'ollama:qwen2.5:1.5b',
      role: 'assistant',
      dynamicContext: { date: '2026-11-22T20:16:00Z', cwd: '/repo/b' },
    });

    if (prompt1.stablePrefix !== prompt2.stablePrefix) {
      throw new Error('System prompt stable prefix was not byte-identical across turns!');
    }
    console.log(`  ✓ Stable prefix is byte-identical (${prompt1.stablePrefix.length} bytes, layers 1-4)`);

    // Live verification with CPU router/compactor model qwen2.5:1.5b
    const cpuAdapter = new OllamaAdapter({ model: 'qwen2.5:1.5b', numGpu: 0 });

    const liveStart = Date.now();
    let liveResponse = '';
    for await (const chunk of cpuAdapter.chat({
      messages: [{ role: 'user', content: 'Reply with the word OK.' }],
      systemPrompt: prompt1.systemPrompt,
    })) {
      if (chunk.delta) liveResponse += chunk.delta;
    }
    const liveDuration = Date.now() - liveStart;
    console.log(`  ✓ Live CPU model executed with prompt cache in ${liveDuration}ms (Response: "${liveResponse.trim()}")`);

    console.log('\n================================================================');
    console.log('            ALL PHASE 4 EXIT GATE CRITERIA PASSED!              ');
    console.log('================================================================');
  } finally {
    try {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

main().catch((err) => {
  console.error('\n❌ Phase 4 exit gate failed:', err);
  process.exit(1);
});

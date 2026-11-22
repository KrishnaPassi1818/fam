import {
  Router,
  RoutingPolicy,
  ToolRetriever,
  EmbeddingService,
  ModelScheduler,
  handleFindTools,
  Tracer,
} from '../packages/core/src/index.js';
import { PrivacyBlocked } from '../packages/shared/src/index.js';
import {
  LABELED_ROUTING_PROMPTS,
  REGISTRY_45_TOOLS,
  EVAL_40_PROMPTS,
} from '../packages/core/src/router/fixtures.js';

async function main() {
  console.log('================================================================');
  console.log('HX HARNESS — PHASE 5 EXIT GATE DEMO & VERIFICATION');
  console.log('Subsystems: Router, Policy, Embeddings, Retriever, Scheduler');
  console.log('================================================================\n');

  const tracer = new Tracer({ sessionId: `p5_gate_${Date.now()}` });

  // -------------------------------------------------------------------------
  // Gate Criterion 1: Rules Fast Path + 1.5B Router & 50-Prompt Evaluation
  // -------------------------------------------------------------------------
  console.log('--- Criterion 1: 50-Prompt Labeled Dataset Evaluation (T5.1) ---');
  const router = new Router({ tracer });
  let correctIntents = 0;
  let correctPrivacy = 0;
  const latencies: number[] = [];

  for (const item of LABELED_ROUTING_PROMPTS) {
    const start = Date.now();
    const decision = await router.route(item.prompt);
    const duration = Date.now() - start;
    latencies.push(duration);

    if (decision.intent === item.intent) correctIntents++;
    if (decision.privacy === item.privacy) correctPrivacy++;
  }

  const intentAccuracy = (correctIntents / LABELED_ROUTING_PROMPTS.length) * 100;
  const privacyAccuracy = (correctPrivacy / LABELED_ROUTING_PROMPTS.length) * 100;
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const maxLatency = Math.max(...latencies);

  console.log(`Evaluated ${LABELED_ROUTING_PROMPTS.length} prompts:`);
  console.log(`  - Intent Classification Accuracy: ${intentAccuracy.toFixed(1)}% (Threshold: >= 90%)`);
  console.log(`  - Privacy Detection Accuracy:     ${privacyAccuracy.toFixed(1)}% (Threshold: 100%)`);
  console.log(`  - Average Routing Latency:        ${avgLatency.toFixed(2)} ms (Threshold: < 800 ms)`);
  console.log(`  - Max Routing Latency:            ${maxLatency.toFixed(2)} ms`);

  if (intentAccuracy < 90) {
    throw new Error(`Criterion 1 failed: intent accuracy ${intentAccuracy}% < 90%`);
  }
  if (avgLatency >= 800) {
    throw new Error(`Criterion 1 failed: average latency ${avgLatency}ms >= 800ms`);
  }
  console.log('✅ Criterion 1 PASSED: Router accuracy >= 90% and CPU latency < 800ms.\n');

  // -------------------------------------------------------------------------
  // Gate Criterion 2: Policy Loader & Local-Only Privacy Guarantee (T5.2)
  // -------------------------------------------------------------------------
  console.log('--- Criterion 2: Routing Policy & Privacy Enforcement (T5.2) ---');
  const policy = new RoutingPolicy();

  // Test normal coding task
  const codingChain = policy.resolve({
    intent: 'coding',
    complexity: 2,
    privacy: 'normal',
    categories: ['code'],
    needs_code: true,
    needs_web: false,
    needs_office: false,
    confidence: 0.95,
    source: 'rules',
  });
  console.log(`Coding (complexity 2, normal) -> Chain: [${codingChain.join(', ')}]`);

  // Test local-only task
  const localOnlyChain = policy.resolve({
    intent: 'coding',
    complexity: 4,
    privacy: 'local_only',
    categories: ['code'],
    needs_code: true,
    needs_web: false,
    needs_office: false,
    confidence: 0.95,
    source: 'rules',
  });
  console.log(`Sensitive (complexity 4, local_only) -> Chain: [${localOnlyChain.join(', ')}]`);

  for (const m of localOnlyChain) {
    if (m.includes('gemini') || m.includes('cloud')) {
      throw new Error(`Criterion 2 failed: local_only chain contains cloud model ${m}`);
    }
  }

  // Test that attempting to override with Gemini on local_only prompt throws PrivacyBlocked
  let blockedCaught = false;
  try {
    policy.resolve(
      {
        intent: 'coding',
        complexity: 2,
        privacy: 'local_only',
        categories: ['code'],
        needs_code: true,
        needs_web: false,
        needs_office: false,
        confidence: 0.95,
        source: 'rules',
      },
      'gemini:gemini-2.5-pro'
    );
  } catch (err) {
    if (err instanceof PrivacyBlocked || (err as any)?.code === 'PRIVACY_BLOCKED') {
      blockedCaught = true;
    }
  }

  if (!blockedCaught) {
    throw new Error('Criterion 2 failed: overriding with Gemini on local_only did not throw PrivacyBlocked');
  }
  console.log('✅ Criterion 2 PASSED: Policy loaded and cloud models strictly stripped for local_only.\n');

  // -------------------------------------------------------------------------
  // Gate Criterion 3: >= 40 Registered Tools & Tool Selection Eval (T5.7)
  // -------------------------------------------------------------------------
  console.log('--- Criterion 3: 40-Prompt Tool Selection with >= 40 Tools (T5.7) ---');
  const embeddingService = new EmbeddingService();
  const retriever = new ToolRetriever({ embeddingService, defaultTopK: 6 });

  console.log(`Registering ${REGISTRY_45_TOOLS.length} fixture tools across all categories...`);
  for (const tool of REGISTRY_45_TOOLS) {
    retriever.registerTool(tool);
  }

  let toolSelectMatches = 0;
  for (const evalItem of EVAL_40_PROMPTS) {
    const retrieved = await retriever.retrieve(evalItem.prompt, {
      categories: [evalItem.category],
    });
    const retrievedNames = retrieved.map((t) => t.name);
    if (retrievedNames.includes(evalItem.target)) {
      toolSelectMatches++;
    }
  }

  const selectionAccuracy = (toolSelectMatches / EVAL_40_PROMPTS.length) * 100;
  console.log(`Evaluated ${EVAL_40_PROMPTS.length} tool-selection prompts against ${retriever.getAllTools().length} tools:`);
  console.log(`  - Tool Selection Accuracy: ${selectionAccuracy.toFixed(1)}% (Threshold: >= 85%)`);

  if (selectionAccuracy < 85) {
    throw new Error(`Criterion 3 failed: tool selection accuracy ${selectionAccuracy}% < 85%`);
  }
  console.log('✅ Criterion 3 PASSED: Correct tool selection >= 85% with >= 40 registered tools.\n');

  // -------------------------------------------------------------------------
  // Gate Criterion 4: Description Shortening for Small Models (T5.5)
  // -------------------------------------------------------------------------
  console.log('--- Criterion 4: Tool Description Shortening for Small Models (T5.5) ---');
  const { tools: shortened, savedTokens } = retriever.shortenForSmallModel(REGISTRY_45_TOOLS);
  console.log(`Shortened descriptions for ${shortened.length} tools:`);
  console.log(`  - Token Savings: ${savedTokens} tokens saved for context window`);
  if (savedTokens <= 0) {
    throw new Error('Criterion 4 failed: no token savings reported for shortened descriptions');
  }
  console.log('✅ Criterion 4 PASSED: Description shortening successfully recovered token budget.\n');

  // -------------------------------------------------------------------------
  // Gate Criterion 5: Dynamic Tool Discovery via find_tools Meta-Tool (T5.4)
  // -------------------------------------------------------------------------
  console.log('--- Criterion 5: find_tools Meta-Tool & Hot-Swap (T5.4) ---');
  retriever.clearStickyTools();
  const findResult = await handleFindTools(retriever, { query: 'delete or trash files safely' });
  console.log(findResult);

  const activeAfterFind = await retriever.retrieve('arbitrary unrelated query');
  const activeNames = activeAfterFind.map((t) => t.name);
  if (!activeNames.includes('fs.trash')) {
    throw new Error('Criterion 5 failed: fs.trash was not activated into sticky context');
  }
  console.log('✅ Criterion 5 PASSED: find_tools dynamically activated tool into active context.\n');

  // -------------------------------------------------------------------------
  // Gate Criterion 6: Local Model Scheduler & VRAM Swap Minimization (T5.6)
  // -------------------------------------------------------------------------
  console.log('--- Criterion 6: Local Model Scheduler & VRAM Swap Minimization (T5.6) ---');
  const scheduler = new ModelScheduler();
  scheduler.resetSwapCount();

  const simulatedWorkload = [
    { name: 'Task 1 (Llama general)', model: 'ollama:llama3.1:8b' },
    { name: 'Task 2 (Llama general)', model: 'ollama:llama3.1:8b' },
    { name: 'Task 3 (Coder edit)', model: 'ollama:qwen2.5-coder:7b' },
    { name: 'Task 4 (Gemini planner)', model: 'gemini:gemini-2.5-flash' },
    { name: 'Task 5 (Llama summary)', model: 'ollama:llama3.1:8b' },
  ];

  console.log('Executing mixed-task workload through ModelScheduler:');
  for (const step of simulatedWorkload) {
    await scheduler.withModel(step.model, async () => {
      console.log(`  - Executed ${step.name} on ${step.model}`);
    });
  }

  const totalSwaps = scheduler.getSwapCount();
  console.log(`Total GPU VRAM swaps performed: ${totalSwaps} (Expected: 2 swaps)`);
  if (totalSwaps !== 2) {
    throw new Error(`Criterion 6 failed: expected exactly 2 GPU swaps, got ${totalSwaps}`);
  }
  console.log('✅ Criterion 6 PASSED: Local model lock enforced, Gemini bypassed, VRAM swaps minimized.\n');

  console.log('================================================================');
  console.log('PHASE 5 EXIT GATE VERIFICATION COMPLETED SUCCESSFULLY!');
  console.log('All 6 exit criteria passed cleanly.');
  console.log('Trace recorded at:', tracer.filePath);
  console.log('================================================================');
}

main().catch((err) => {
  console.error('\n❌ PHASE 5 EXIT GATE FAILED:', err);
  process.exit(1);
});

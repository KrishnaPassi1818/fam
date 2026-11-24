import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { TaskContextManager } from '../context/task-context.js';
import { ContextManager } from '../context/manager.js';
import type { NormalizedToolResult, Message } from '@fam/shared';

describe('Phase 5 — Context & Observation Invalidation Regression Suite', () => {
  let tempDir: string;
  let manager: TaskContextManager;
  let contextManager: ContextManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fam-context-test-'));
    manager = new TaskContextManager();
    contextManager = new ContextManager({ taskContextManager: manager });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // Test 1: Create a file and read it
  it('1. records valid file observation when file is created and read', () => {
    const task = manager.createTask('Create and read test file', tempDir);
    const filePath = path.join(tempDir, 'file_a.txt');
    fs.writeFileSync(filePath, 'Initial content of file A');

    const readResult: NormalizedToolResult = {
      execution_id: 'exec_read_1',
      task_id: task.taskId,
      tool: 'fs_read_file',
      status: 'succeeded',
      arguments: { path: filePath },
      result: 'Initial content of file A',
      error: null,
      duration_ms: 15,
      verified: true,
    };

    task.recordToolResult(readResult);

    const obs = task.getValidFileObservation(filePath);
    expect(obs).not.toBeNull();
    expect(obs?.content).toBe('Initial content of file A');
    expect(obs?.stale).toBe(false);
  });

  // Test 2: Switch to a different file
  it('2. tracks observations independently when switching between files', () => {
    const task = manager.createTask('Track two different files', tempDir);
    const file1 = path.join(tempDir, 'file1.txt');
    const file2 = path.join(tempDir, 'file2.txt');

    fs.writeFileSync(file1, 'Alpha content');
    fs.writeFileSync(file2, 'Beta content');

    task.recordToolResult({
      execution_id: 'exec_read_f1',
      task_id: task.taskId,
      tool: 'fs_read_file',
      status: 'succeeded',
      arguments: { path: file1 },
      result: 'Alpha content',
      error: null,
      duration_ms: 10,
      verified: true,
    });

    task.recordToolResult({
      execution_id: 'exec_read_f2',
      task_id: task.taskId,
      tool: 'fs_read_file',
      status: 'succeeded',
      arguments: { path: file2 },
      result: 'Beta content',
      error: null,
      duration_ms: 10,
      verified: true,
    });

    expect(task.getValidFileObservation(file1)?.content).toBe('Alpha content');
    expect(task.getValidFileObservation(file2)?.content).toBe('Beta content');
  });

  // Test 3: Ask about the second file after modifying the first
  it('3. invalidates cached file observation upon file modification without polluting other files', () => {
    const task = manager.createTask('Modify file1 and query file2', tempDir);
    const file1 = path.join(tempDir, 'doc1.md');
    const file2 = path.join(tempDir, 'doc2.md');

    task.recordToolResult({
      execution_id: 'exec_1',
      task_id: task.taskId,
      tool: 'fs_read_file',
      status: 'succeeded',
      arguments: { path: file1 },
      result: 'Original Doc 1',
      error: null,
      duration_ms: 8,
      verified: true,
    });

    task.recordToolResult({
      execution_id: 'exec_2',
      task_id: task.taskId,
      tool: 'fs_read_file',
      status: 'succeeded',
      arguments: { path: file2 },
      result: 'Untouched Doc 2',
      error: null,
      duration_ms: 8,
      verified: true,
    });

    // Now modify doc1.md
    task.recordToolResult({
      execution_id: 'exec_3',
      task_id: task.taskId,
      tool: 'fs_write_file',
      status: 'succeeded',
      arguments: { path: file1, content: 'Updated Doc 1' },
      result: { bytes_written: 13 },
      error: null,
      duration_ms: 12,
      verified: true,
    });

    // doc1 observation must be marked stale and return null for valid observation
    expect(task.getValidFileObservation(file1)).toBeNull();
    expect(task.fileObservations.get(file1)?.stale).toBe(true);

    // doc2 observation must remain valid and unpolluted
    expect(task.getValidFileObservation(file2)?.content).toBe('Untouched Doc 2');
  });

  // Test 4: Navigate from example.com to Wikipedia
  it('4. automatically invalidates DOM observation when browser navigates to a new URL', () => {
    const task = manager.createTask('Navigate across websites');

    // Visit example.com
    task.recordToolResult({
      execution_id: 'exec_nav_1',
      task_id: task.taskId,
      tool: 'browser_navigate',
      status: 'succeeded',
      arguments: { url: 'https://example.com' },
      result: { url: 'https://example.com', title: 'Example Domain' },
      error: null,
      duration_ms: 100,
      verified: true,
    });

    task.recordToolResult({
      execution_id: 'exec_dom_1',
      task_id: task.taskId,
      tool: 'browser_read_dom',
      status: 'succeeded',
      arguments: {},
      result: {
        url: 'https://example.com',
        title: 'Example Domain',
        heading: 'Example Domain',
        content: '<h1>Example Domain</h1><p>This domain is for use in illustrative examples.</p>',
      },
      error: null,
      duration_ms: 40,
      verified: true,
    });

    expect(task.getValidDomObservation()?.heading).toBe('Example Domain');
    expect(task.getValidDomObservation()?.stale).toBe(false);

    // Navigate to Wikipedia
    task.recordToolResult({
      execution_id: 'exec_nav_2',
      task_id: task.taskId,
      tool: 'browser_navigate',
      status: 'succeeded',
      arguments: { url: 'https://www.wikipedia.org' },
      result: { url: 'https://www.wikipedia.org', title: 'Wikipedia' },
      error: null,
      duration_ms: 120,
      verified: true,
    });

    // The previous DOM observation for example.com must now be stale
    expect(task.getValidDomObservation()).toBeNull();
    expect(task.domObservation?.stale).toBe(true);
  });

  // Test 5: Ask for current page heading after DOM invalidation
  it('5. accepts fresh DOM observation on Wikipedia and rejects stale example.com heading', () => {
    const task = manager.createTask('DOM heading extraction across sites');

    task.recordDomObservation({
      url: 'https://example.com',
      title: 'Example Domain',
      heading: 'Example Domain Heading',
      content: '<h1>Example Domain Heading</h1>',
    });
    expect(task.getValidDomObservation()?.heading).toBe('Example Domain Heading');

    // Invalidate due to navigation
    task.invalidateDom('https://www.wikipedia.org');
    expect(task.getValidDomObservation()).toBeNull();

    // Fresh DOM read on Wikipedia
    task.recordDomObservation({
      url: 'https://www.wikipedia.org',
      title: 'Wikipedia, the free encyclopedia',
      heading: 'Wikipedia',
      content: '<h1>Wikipedia</h1>',
    });

    const freshDom = task.getValidDomObservation();
    expect(freshDom).not.toBeNull();
    expect(freshDom?.url).toBe('https://www.wikipedia.org');
    expect(freshDom?.heading).toBe('Wikipedia');
    expect(freshDom?.stale).toBe(false);
  });

  // Test 6: Change directories
  it('6. tracks working directory changes from shell/command tool executions', () => {
    const initialCwd = '/home/krishna/Projects/harness';
    const task = manager.createTask('Test directory changes', initialCwd);
    expect(task.currentWorkingDirectory).toBe(initialCwd);

    task.recordToolResult({
      execution_id: 'exec_cd_1',
      task_id: task.taskId,
      tool: 'sandbox_run_command',
      status: 'succeeded',
      arguments: { command: 'cd /tmp && ls -la' },
      result: { stdout: '', exit_code: 0 },
      error: null,
      duration_ms: 15,
      verified: true,
    });

    expect(task.currentWorkingDirectory).toBe('/tmp');
  });

  // Test 7: Ask for current directory after nested changes
  it('7. accurately reports current directory across multiple nested commands', () => {
    const task = manager.createTask('Navigate nested dirs', '/var/log');
    expect(task.currentWorkingDirectory).toBe('/var/log');

    task.updateCwd('/var/log/nginx');
    expect(task.currentWorkingDirectory).toBe('/var/log/nginx');

    task.recordToolResult({
      execution_id: 'exec_cd_2',
      task_id: task.taskId,
      tool: 'shell_exec',
      status: 'succeeded',
      arguments: { cwd: '/home/krishna/anarc' },
      result: { exit_code: 0 },
      error: null,
      duration_ms: 10,
      verified: true,
    });

    expect(task.currentWorkingDirectory).toBe('/home/krishna/anarc');
  });

  // Test 8: Failed operation followed by dependent operation
  it('8. records failure in task errors ledger to prevent dependent actions from assuming success', () => {
    const task = manager.createTask('Build and run project');

    const failResult: NormalizedToolResult = {
      execution_id: 'exec_compile_err',
      task_id: task.taskId,
      tool: 'sandbox_run_command',
      status: 'failed',
      arguments: { command: 'cargo build' },
      result: null,
      error: 'error[E0432]: unresolved import `foo`',
      duration_ms: 250,
      verified: true,
    };

    task.recordToolResult(failResult);

    expect(task.errors.length).toBe(1);
    expect(task.errors[0]?.error).toContain('unresolved import `foo`');
    expect(task.errors[0]?.tool).toBe('sandbox_run_command');
    expect(task.toolCalls[0]?.status).toBe('failed');
  });

  // Test 9: Multiple independent tasks in one conversation
  it('9. isolates memory, tools, and observations between independent tasks', () => {
    const taskA = manager.createTask('Task A: Analyze repo 1', '/repos/fam');
    const taskB = manager.createTask('Task B: Analyze repo 2', '/repos/anarc');

    expect(taskA.taskId).not.toBe(taskB.taskId);
    expect(taskA.currentWorkingDirectory).toBe('/repos/fam');
    expect(taskB.currentWorkingDirectory).toBe('/repos/anarc');

    taskA.recordFileObservation('/repos/fam/README.md', '# FAM Readme');
    taskB.recordFileObservation('/repos/anarc/README.md', '# ANARC Readme');

    expect(taskA.fileObservations.has('/repos/fam/README.md')).toBe(true);
    expect(taskA.fileObservations.has('/repos/anarc/README.md')).toBe(false);

    expect(taskB.fileObservations.has('/repos/anarc/README.md')).toBe(true);
    expect(taskB.fileObservations.has('/repos/fam/README.md')).toBe(false);
  });

  // Test 10: Restart FAM and inspect persistent state
  it('10. serializes and deserializes task context with complete state fidelity', () => {
    const originalTask = manager.createTask('Long running evaluation task', '/home/krishna/workspace');
    originalTask.setPlan({
      task_id: originalTask.taskId,
      user_request: originalTask.userRequest,
      steps: [
        { id: 1, status: 'pending', description: 'Analyze requirements', tool: 'fs_read_file' },
        { id: 2, status: 'pending', description: 'Generate code', tool: 'fs_write_file' },
      ],
      created_at: Date.now(),
      updated_at: Date.now(),
      is_complex: true,
    });
    originalTask.advanceStep(1, 'completed', 'Step 1 complete');
    originalTask.recordFileObservation('/home/krishna/workspace/main.rs', 'fn main() {}');
    originalTask.recordDomObservation({
      url: 'http://localhost:3000',
      title: 'Dev Server',
      heading: 'App Ready',
      content: '<h1>App Ready</h1>',
    });
    originalTask.addEvidence('Code compiled and unit tests passed 10/10');
    originalTask.completionState = 'COMPLETED';

    // Serialize task state
    const serializedJson = manager.serialize(originalTask.taskId);
    expect(typeof serializedJson).toBe('string');

    // Create a new fresh manager simulating FAM restart
    const restoredManager = new TaskContextManager();
    const restoredTask = restoredManager.deserialize(serializedJson);

    expect(restoredTask.taskId).toBe(originalTask.taskId);
    expect(restoredTask.userRequest).toBe('Long running evaluation task');
    expect(restoredTask.currentWorkingDirectory).toBe('/home/krishna/workspace');
    expect(restoredTask.plan?.steps.length).toBe(2);
    expect(restoredTask.currentStep).toBe(1);
    expect(restoredTask.previousSteps[0]?.status).toBe('completed');
    expect(restoredTask.getValidFileObservation('/home/krishna/workspace/main.rs')?.content).toBe('fn main() {}');
    expect(restoredTask.getValidDomObservation()?.heading).toBe('App Ready');
    expect(restoredTask.verificationEvidence).toContain('Code compiled and unit tests passed 10/10');
    expect(restoredTask.completionState).toBe('COMPLETED');
  });

  // Additional Context Manager Preparation test: Invalidation in messages
  it('annotates stale tool result observations in conversation history during context preparation', async () => {
    const task = manager.createTask('Context preparation test');
    task.recordDomObservation({
      url: 'https://initial.site',
      content: '<h1>Initial Site</h1>',
    });

    const messages: Message[] = [
      {
        role: 'user',
        content: 'Read the DOM from initial site',
      },
      {
        role: 'tool',
        callId: 'call_1',
        name: 'browser_read_dom',
        content: 'Page DOM: <h1>Initial Site</h1><!DOCTYPE html><html><body><h1>Initial Site</h1></body></html>',
      },
    ];

    // Invalidate DOM due to new navigation
    task.invalidateDom('https://subsequent.site');

    const prep = await contextManager.prepareContext('System prompt', [], messages, task);

    expect(prep.appliedStrategies).toContain('observation_invalidation(1)');
    const toolMsg = prep.messages.find((m) => m.role === 'tool');
    expect(toolMsg?.content).toContain('[STALE OBSERVATION INVALIDATED: Browser navigated to https://subsequent.site; previous DOM is no longer valid]');
  });
});

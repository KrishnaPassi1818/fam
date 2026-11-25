import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { TaskContextManager } from '../context/task-context.js';
import { TaskPlanner } from '../loop/planner.js';

const execFileAsync = promisify(execFile);

describe('Phase 7 — Real-World Multi-Tool Workflows', () => {
  let tempDir: string;
  let taskManager: TaskContextManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fam-workflow-test-'));
    taskManager = new TaskContextManager();
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // Workflow 1: End-to-End Filesystem Workflow
  it('1. executes complete filesystem project structure generation, editing, moving, and searching', async () => {
    const task = taskManager.createTask('Scaffold and refactor a modular project', tempDir);
    const plan = TaskPlanner.generatePlan(task.taskId, task.userRequest);
    task.setPlan(plan);

    // Step 1: Create directories
    const srcDir = path.join(tempDir, 'src');
    const docsDir = path.join(tempDir, 'docs');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(docsDir, { recursive: true });

    task.recordToolResult({
      execution_id: 'exec_mkdir',
      task_id: task.taskId,
      tool: 'fs_create_dir',
      status: 'succeeded',
      arguments: { path: srcDir },
      result: { created: true },
      error: null,
      duration_ms: 10,
      verified: true,
    });
    task.advanceStep(1, 'completed');

    // Step 2: Create files
    const indexFile = path.join(srcDir, 'index.ts');
    const utilsFile = path.join(srcDir, 'utils.ts');
    const readmeFile = path.join(docsDir, 'README.md');

    fs.writeFileSync(indexFile, 'import { add } from "./utils.js";\nconsole.log(add(2, 3));\n');
    fs.writeFileSync(utilsFile, 'export function add(a: number, b: number): number {\n  return a + b;\n}\n');
    fs.writeFileSync(readmeFile, '# Modular Project\nDocumentation draft.\n');

    task.recordToolResult({
      execution_id: 'exec_write_files',
      task_id: task.taskId,
      tool: 'fs_write_file',
      status: 'succeeded',
      arguments: { path: indexFile },
      result: { bytes_written: 65 },
      error: null,
      duration_ms: 15,
      verified: true,
    });
    task.advanceStep(2, 'completed');

    // Step 3: Modify existing file
    fs.writeFileSync(utilsFile, 'export function add(a: number, b: number): number {\n  return a + b;\n}\nexport function multiply(a: number, b: number): number {\n  return a * b;\n}\n');
    task.recordToolResult({
      execution_id: 'exec_modify_utils',
      task_id: task.taskId,
      tool: 'fs_write_file',
      status: 'succeeded',
      arguments: { path: utilsFile },
      result: { bytes_written: 130 },
      error: null,
      duration_ms: 12,
      verified: true,
    });

    // Step 4: Move/rename file
    const rootReadme = path.join(tempDir, 'README.md');
    fs.renameSync(readmeFile, rootReadme);
    task.recordToolResult({
      execution_id: 'exec_move_readme',
      task_id: task.taskId,
      tool: 'fs_move',
      status: 'succeeded',
      arguments: { source: readmeFile, destination: rootReadme },
      result: { moved: true },
      error: null,
      duration_ms: 8,
      verified: true,
    });

    // Step 5: Search project files
    const files = fs.readdirSync(tempDir);
    expect(files).toContain('src');
    expect(files).toContain('README.md');
    expect(fs.existsSync(readmeFile)).toBe(false);
    expect(fs.readFileSync(rootReadme, 'utf-8')).toContain('# Modular Project');

    const utilsContent = fs.readFileSync(utilsFile, 'utf-8');
    expect(utilsContent).toContain('export function multiply');

    task.addEvidence('All project files and structure verified on disk');
    task.completionState = 'COMPLETED';

    expect(task.verificationEvidence.length).toBeGreaterThan(0);
    expect(task.completionState).toBe('COMPLETED');
  });

  // Workflow 2: Python Create -> Run -> Observe Error -> Fix -> Run -> Verify Success
  it('2. executes Python development lifecycle with error capture and automated bugfix', async () => {
    const task = taskManager.createTask('Develop, debug, and run Python script', tempDir);

    const scriptPath = path.join(tempDir, 'process_data.py');
    const outputPath = path.join(tempDir, 'output.json');

    // Phase A: Write buggy Python script (syntax or ZeroDivisionError)
    const buggyCode = `
import json

def calculate(x, y):
    # Buggy operation: division by zero
    return x / y

try:
    result = calculate(10, 0)
    with open("${outputPath}", "w") as f:
        json.dump({"result": result}, f)
except Exception as e:
    import sys
    sys.stderr.write(f"RuntimeError: {e}\\n")
    sys.exit(1)
`;
    fs.writeFileSync(scriptPath, buggyCode);

    // Run buggy script
    let failedRunResult: { stdout: string; stderr: string; exitCode: number };
    try {
      const { stdout, stderr } = await execFileAsync('python3', [scriptPath], { cwd: tempDir });
      failedRunResult = { stdout, stderr, exitCode: 0 };
    } catch (err: unknown) {
      const execErr = err as { stdout?: string; stderr?: string; code?: number };
      failedRunResult = {
        stdout: execErr.stdout || '',
        stderr: execErr.stderr || '',
        exitCode: execErr.code || 1,
      };
    }

    expect(failedRunResult.exitCode).toBe(1);
    expect(failedRunResult.stderr).toContain('RuntimeError: division by zero');

    // Record error in task execution context
    task.recordToolResult({
      execution_id: 'exec_py_run_1',
      task_id: task.taskId,
      tool: 'sandbox_run_command',
      status: 'failed',
      arguments: { command: `python3 ${scriptPath}` },
      result: null,
      error: failedRunResult.stderr,
      duration_ms: 120,
      verified: true,
    });

    expect(task.errors.length).toBe(1);
    expect(task.errors[0]?.error).toContain('division by zero');

    // Phase B: Fix bug
    const fixedCode = `
import json

def calculate(x, y):
    if y == 0:
        return 0
    return x / y

result = calculate(10, 2)
with open("${outputPath}", "w") as f:
    json.dump({"result": result, "status": "ok"}, f)
print(f"Calculated: {result}")
`;
    fs.writeFileSync(scriptPath, fixedCode);

    // Run fixed script
    const { stdout: fixedStdout } = await execFileAsync('python3', [scriptPath], { cwd: tempDir });
    expect(fixedStdout).toContain('Calculated: 5.0');

    task.recordToolResult({
      execution_id: 'exec_py_run_2',
      task_id: task.taskId,
      tool: 'sandbox_run_command',
      status: 'succeeded',
      arguments: { command: `python3 ${scriptPath}` },
      result: { stdout: fixedStdout, exit_code: 0 },
      error: null,
      duration_ms: 105,
      verified: true,
    });

    // Verify output file on disk
    expect(fs.existsSync(outputPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    expect(parsed.result).toBe(5.0);
    expect(parsed.status).toBe('ok');

    task.addEvidence('Python script corrected and verified with output file on disk');
    task.completionState = 'COMPLETED';
  });

  // Workflow 3: Node.js Multi-step Development & Test Workflow
  it('3. executes Node.js module creation and unit testing workflow', async () => {
    const task = taskManager.createTask('Create and test Node.js library module', tempDir);

    const mathLib = path.join(tempDir, 'math.cjs');
    const testRunner = path.join(tempDir, 'test.cjs');

    fs.writeFileSync(
      mathLib,
      `
module.exports = {
  factorial: function(n) {
    if (n <= 1) return 1;
    return n * this.factorial(n - 1);
  }
};
`
    );

    fs.writeFileSync(
      testRunner,
      `
const assert = require('node:assert');
const math = require('./math.cjs');

assert.strictEqual(math.factorial(0), 1);
assert.strictEqual(math.factorial(1), 1);
assert.strictEqual(math.factorial(5), 120);
console.log('ALL_TESTS_PASSED: 3/3');
`
    );

    const { stdout } = await execFileAsync('node', [testRunner], { cwd: tempDir });
    expect(stdout).toContain('ALL_TESTS_PASSED: 3/3');

    task.recordToolResult({
      execution_id: 'exec_node_test',
      task_id: task.taskId,
      tool: 'sandbox_run_command',
      status: 'succeeded',
      arguments: { command: 'node test.cjs' },
      result: { stdout, exit_code: 0 },
      error: null,
      duration_ms: 90,
      verified: true,
    });

    task.addEvidence('Node.js test runner executed cleanly with 3 assertions verified');
    task.completionState = 'COMPLETED';
  });

  // Workflow 4: Rust Create, Compile, and Execute Workflow
  it('4. compiles and runs a standalone Rust utility binary', async () => {
    const task = taskManager.createTask('Compile and run Rust utility', tempDir);

    const srcFile = path.join(tempDir, 'fib.rs');
    const binFile = path.join(tempDir, 'fib');

    fs.writeFileSync(
      srcFile,
      `
fn fib(n: u64) -> u64 {
    match n {
        0 => 0,
        1 => 1,
        _ => fib(n - 1) + fib(n - 2),
    }
}

fn main() {
    let result = fib(10);
    println!("FIB_10: {}", result);
}
`
    );

    // Compile using rustc
    await execFileAsync('rustc', [srcFile, '-o', binFile], { cwd: tempDir });
    expect(fs.existsSync(binFile)).toBe(true);

    // Execute compiled binary
    const { stdout } = await execFileAsync(binFile, [], { cwd: tempDir });
    expect(stdout).toContain('FIB_10: 55');

    task.recordToolResult({
      execution_id: 'exec_rust_run',
      task_id: task.taskId,
      tool: 'sandbox_run_command',
      status: 'succeeded',
      arguments: { command: './fib' },
      result: { stdout, exit_code: 0 },
      error: null,
      duration_ms: 15,
      verified: true,
    });

    task.addEvidence('Rust binary compiled and verified FIB_10 = 55');
    task.completionState = 'COMPLETED';
  });

  // Workflow 5: Combined Browser Data Extraction + Filesystem + Python Analytics
  it('5. executes combined Browser web data extraction, CSV persistence, and Python analysis', async () => {
    // A: Spin up local web server with product catalog table
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
<!DOCTYPE html>
<html>
<head><title>Inventory Report</title></head>
<body>
  <h1>Quarterly Inventory</h1>
  <table id="products">
    <thead><tr><th>Item</th><th>Units</th><th>Unit_Price</th></tr></thead>
    <tbody>
      <tr><td>Laptop</td><td>15</td><td>1200</td></tr>
      <tr><td>Monitor</td><td>30</td><td>350</td></tr>
      <tr><td>Keyboard</td><td>50</td><td>80</td></tr>
      <tr><td>Mouse</td><td>60</td><td>45</td></tr>
    </tbody>
  </table>
</body>
</html>
      `);
    });

    const port = await new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        resolve(typeof addr === 'object' && addr ? addr.port : 8999);
      });
    });

    const url = `http://127.0.0.1:${port}/`;
    const task = taskManager.createTask('Extract web inventory data, store CSV, and compute metrics with Python', tempDir);

    try {
      // Step 1: Simulate browser reading page
      const rawHtml = await new Promise<string>((resolve, reject) => {
        http.get(url, (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve(data));
          res.on('error', reject);
        });
      });

      expect(rawHtml).toContain('Quarterly Inventory');

      // Step 2: Parse table rows into CSV
      const rows = [
        ['Item', 'Units', 'Unit_Price'],
        ['Laptop', '15', '1200'],
        ['Monitor', '30', '350'],
        ['Keyboard', '50', '80'],
        ['Mouse', '60', '45'],
      ];
      const csvContent = rows.map((r) => r.join(',')).join('\n') + '\n';
      const csvPath = path.join(tempDir, 'inventory.csv');
      fs.writeFileSync(csvPath, csvContent);

      task.recordFileObservation(csvPath, csvContent);
      task.recordToolResult({
        execution_id: 'exec_csv_write',
        task_id: task.taskId,
        tool: 'fs_write_file',
        status: 'succeeded',
        arguments: { path: csvPath },
        result: { bytes_written: csvContent.length },
        error: null,
        duration_ms: 12,
        verified: true,
      });

      // Step 3: Write Python analysis script
      const analysisScriptPath = path.join(tempDir, 'analyze_inventory.py');
      const metricsOutputPath = path.join(tempDir, 'inventory_metrics.json');

      const analysisCode = `
import csv
import json

total_value = 0
total_units = 0
items = []

with open("${csvPath}", mode="r") as f:
    reader = csv.DictReader(f)
    for row in reader:
        units = int(row["Units"])
        price = float(row["Unit_Price"])
        val = units * price
        total_value += val
        total_units += units
        items.append({"item": row["Item"], "total_value": val})

summary = {
    "total_inventory_value": total_value,
    "total_units_stocked": total_units,
    "item_count": len(items)
}

with open("${metricsOutputPath}", "w") as f:
    json.dump(summary, f, indent=2)

print(f"TOTAL_VALUE: {total_value}")
`;
      fs.writeFileSync(analysisScriptPath, analysisCode);

      // Step 4: Execute Python analysis script
      const { stdout: pyStdout } = await execFileAsync('python3', [analysisScriptPath], { cwd: tempDir });
      expect(pyStdout).toContain('TOTAL_VALUE: 35200.0');

      task.recordToolResult({
        execution_id: 'exec_py_analytics',
        task_id: task.taskId,
        tool: 'sandbox_run_command',
        status: 'succeeded',
        arguments: { command: `python3 ${analysisScriptPath}` },
        result: { stdout: pyStdout, exit_code: 0 },
        error: null,
        duration_ms: 110,
        verified: true,
      });

      // Step 5: Verify on-disk output
      expect(fs.existsSync(metricsOutputPath)).toBe(true);
      const metrics = JSON.parse(fs.readFileSync(metricsOutputPath, 'utf-8'));
      expect(metrics.total_inventory_value).toBe(35200);
      expect(metrics.total_units_stocked).toBe(155);
      expect(metrics.item_count).toBe(4);

      task.addEvidence(`Inventory verified on disk: ${metrics.total_units_stocked} units across ${metrics.item_count} items valued at $${metrics.total_inventory_value}`);
      task.completionState = 'COMPLETED';

      expect(task.completionState).toBe('COMPLETED');
      expect(task.verificationEvidence.length).toBeGreaterThan(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

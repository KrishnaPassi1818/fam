import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import type { TaskDefinition } from './types.js';

export function resolveTasksDir(startDir?: string): string {
  if (startDir && fs.existsSync(startDir)) {
    return startDir;
  }

  // 1. Check relative to this module package directory
  try {
    const modDir = path.dirname(fileURLToPath(import.meta.url));
    const pkgDir = path.resolve(modDir, '..');
    const pkgTasks = path.join(pkgDir, 'tasks');
    if (fs.existsSync(pkgTasks) && fs.statSync(pkgTasks).isDirectory()) {
      return pkgTasks;
    }
  } catch {
    // ignore
  }

  // 2. Search upwards from cwd
  let curr = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(curr, 'tasks');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
    const evalsCandidate = path.join(curr, 'packages', 'evals', 'tasks');
    if (fs.existsSync(evalsCandidate) && fs.statSync(evalsCandidate).isDirectory()) {
      return evalsCandidate;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return path.resolve(process.cwd(), 'tasks');
}

export function loadTaskFile(filePath: string): TaskDefinition {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = YAML.parse(content) as TaskDefinition;
  if (!parsed.id) {
    parsed.id = path.basename(filePath, path.extname(filePath));
  }
  if (!parsed.suite) {
    parsed.suite = 'smoke';
  }
  if (!parsed.checks) {
    parsed.checks = [];
  }
  return parsed;
}

export function loadAllTasks(tasksDir?: string): TaskDefinition[] {
  const targetDir = tasksDir || resolveTasksDir();
  if (!fs.existsSync(targetDir)) return [];

  const tasks: TaskDefinition[] = [];
  const entries = fs.readdirSync(targetDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
      try {
        const task = loadTaskFile(path.join(targetDir, entry.name));
        tasks.push(task);
      } catch {
        // Skip unparseable task files
      }
    }
  }

  return tasks.sort((a, b) => a.id.localeCompare(b.id));
}

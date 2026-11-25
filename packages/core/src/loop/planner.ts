import type { ExecutionPlan, PlanStep, NormalizedToolResult } from '@fam/shared';

export class TaskPlanner {
  /**
   * Evaluates whether a user prompt represents a complex task requiring structured planning.
   * Simple requests (e.g. read a file, what time is it, pure questions) return false.
   */
  public static isComplexTask(prompt: string): boolean {
    const lower = prompt.toLowerCase();
    
    // Check for multi-action conjunctions
    const hasConjunction = /(?:and then|and also|and execute|and run|and save|and verify|and test|then)/i.test(lower);
    const hasWorkflowKeywords = /(?:create.*(?:script|file|app|project).*and.*(?:run|execute|save|test))/i.test(lower);
    const hasCodingLifecycle = /(?:build|compile|install|refactor|benchmark|workflow|pipeline|diagnose|automate)/i.test(lower);
    const hasMultipleSteps = (prompt.match(/\b(?:\d+\.|\-|\*)\s+/g) || []).length >= 2;

    // Fast reject for simple direct requests
    const isSimpleRead = /^(?:read|cat|view|show|display|get|check|what is|why|how)\s+(?:the\s+)?(?:file|time|date|status|content|version)?\s*[\w\.\-\/]*$/i.test(lower.trim());
    if (isSimpleRead && !hasConjunction) {
      return false;
    }

    return hasWorkflowKeywords || (hasConjunction && hasCodingLifecycle) || hasMultipleSteps;
  }

  /**
   * Generates a structured internal execution plan for complex requests.
   */
  public static generatePlan(taskId: string, prompt: string): ExecutionPlan {
    const steps: PlanStep[] = [];
    const lower = prompt.toLowerCase();

    let stepId = 1;

    // Heuristic planning template for script creation + execution workflows
    if (lower.includes('python') || lower.includes('.py')) {
      steps.push({
        id: stepId++,
        description: 'Identify or prepare target working directory and script path',
        tool: 'fs_file_info',
        status: 'pending',
      });
      steps.push({
        id: stepId++,
        description: 'Create and write the Python source file',
        tool: 'fs_create_file',
        status: 'pending',
      });
      steps.push({
        id: stepId++,
        description: 'Verify file exists on disk',
        tool: 'fs_file_info',
        status: 'pending',
      });
      steps.push({
        id: stepId++,
        description: 'Execute script and capture stdout, stderr, and exit code',
        tool: 'sandbox_run_command',
        status: 'pending',
      });
      if (lower.includes('save') || lower.includes('output file')) {
        steps.push({
          id: stepId++,
          description: 'Save script output to destination file',
          tool: 'fs_write_file',
          status: 'pending',
        });
        steps.push({
          id: stepId++,
          description: 'Verify output file contents on disk',
          tool: 'fs_read_file',
          status: 'pending',
        });
      }
      steps.push({
        id: stepId++,
        description: 'Return verified results grounded in actual execution',
        status: 'pending',
      });
    } else if (lower.includes('browse') || lower.includes('website') || lower.includes('url') || lower.includes('http')) {
      steps.push({
        id: stepId++,
        description: 'Verify browser readiness and launch if needed',
        tool: 'browser_launch',
        status: 'pending',
      });
      steps.push({
        id: stepId++,
        description: 'Navigate to target URL and wait for page load',
        tool: 'browser_navigate',
        status: 'pending',
      });
      steps.push({
        id: stepId++,
        description: 'Extract grounded page content or interactive elements',
        tool: 'browser_read',
        status: 'pending',
      });
      if (lower.includes('save') || lower.includes('file')) {
        steps.push({
          id: stepId++,
          description: 'Save extracted content to destination file',
          tool: 'fs_write_file',
          status: 'pending',
        });
      }
      steps.push({
        id: stepId++,
        description: 'Synthesize findings grounded in browser observations',
        status: 'pending',
      });
    } else {
      // General multi-step workflow
      steps.push({
        id: stepId++,
        description: 'Analyze requirements and verify environment state',
        status: 'pending',
      });
      steps.push({
        id: stepId++,
        description: 'Execute primary tool actions',
        status: 'pending',
      });
      steps.push({
        id: stepId++,
        description: 'Verify tool execution results and filesystem/process state',
        status: 'pending',
      });
      steps.push({
        id: stepId++,
        description: 'Return grounded final response',
        status: 'pending',
      });
    }

    return {
      task_id: taskId,
      user_request: prompt,
      steps,
      created_at: Date.now(),
      updated_at: Date.now(),
      is_complex: true,
    };
  }

  /**
   * Validates whether a response claiming completion has sufficient execution evidence.
   */
  public static verifyExecutionEvidence(
    prompt: string,
    results: NormalizedToolResult[],
  ): { grounded: boolean; reason?: string } {
    const lower = prompt.toLowerCase();
    const needsExecution = /(?:create|write|run|execute|save|make|delete|remove|install|test|browse|navigate|click)/i.test(lower);

    // If user prompt required an action, but zero tools were executed
    if (needsExecution && results.length === 0) {
      return {
        grounded: false,
        reason: 'Task required actionable operations (file creation, command execution, or browsing), but no tools were executed.',
      };
    }

    // Check if any executed tools encountered unrecovered errors
    const lastResult = results[results.length - 1];
    if (results.length > 0 && lastResult && lastResult.status === 'failed') {
      return {
        grounded: false,
        reason: `Last tool call '${lastResult.tool}' failed with error: ${lastResult.error}. Cannot report success without resolving execution failure.`,
      };
    }

    return { grounded: true };
  }
}

import AjvModule, { type ValidateFunction, type ErrorObject } from 'ajv';
import addFormatsModule from 'ajv-formats';
import type { ToolDescriptor } from '@fam/shared';

// ESM Interop
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AjvClass: any = (AjvModule as any).default || AjvModule;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormatsFn: any = (addFormatsModule as any).default || addFormatsModule;

export interface ValidationSuccess {
  valid: true;
  args: Record<string, unknown>;
}

export interface ValidationFailure {
  valid: false;
  error: string;
  errors: ErrorObject[];
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

export class ToolValidator {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly ajv: any;
  private readonly validatorCache = new Map<string, ValidateFunction>();

  constructor() {
    this.ajv = new AjvClass({
      allErrors: true,
      coerceTypes: true, // AJV native coercion support
      useDefaults: true,
      strict: false,
    });
    addFormatsFn(this.ajv);
  }

  public coerce(
    rawArgs: Record<string, unknown>,
    schema: Record<string, unknown>,
  ): Record<string, unknown> {
    const coerced: Record<string, unknown> = { ...rawArgs };
    const properties = (schema['properties'] || {}) as Record<string, Record<string, unknown>>;

    // 1. Common parameter name hallucinations repair
    if (properties['path'] && coerced['path'] === undefined) {
      if (typeof coerced['paths'] === 'string') {
        coerced['path'] = coerced['paths'];
      } else if (typeof coerced['file'] === 'string') {
        coerced['path'] = coerced['file'];
      } else if (typeof coerced['filename'] === 'string') {
        coerced['path'] = coerced['filename'];
      } else if (typeof coerced['filepath'] === 'string') {
        coerced['path'] = coerced['filepath'];
      } else if (typeof coerced['dir'] === 'string') {
        coerced['path'] = coerced['dir'];
      } else if (typeof coerced['directory'] === 'string') {
        coerced['path'] = coerced['directory'];
      }
    }

    if (properties['content'] && coerced['content'] === undefined) {
      if (typeof coerced['contents'] === 'string') {
        coerced['content'] = coerced['contents'];
      } else if (typeof coerced['text'] === 'string') {
        coerced['content'] = coerced['text'];
      } else if (typeof coerced['body'] === 'string') {
        coerced['content'] = coerced['body'];
      } else if (typeof coerced['data'] === 'string') {
        coerced['content'] = coerced['data'];
      }
    }

    if (properties['pattern'] && coerced['pattern'] === undefined) {
      if (typeof coerced['regex'] === 'string') {
        coerced['pattern'] = coerced['regex'];
      } else if (typeof coerced['query'] === 'string') {
        coerced['pattern'] = coerced['query'];
      }
    }

    if (properties['expression'] && coerced['expression'] === undefined) {
      if (typeof coerced['formula'] === 'string') {
        coerced['expression'] = coerced['formula'];
      } else if (typeof coerced['expr'] === 'string') {
        coerced['expression'] = coerced['expr'];
      } else if (typeof coerced['calculation'] === 'string') {
        coerced['expression'] = coerced['calculation'];
      } else if (typeof coerced['query'] === 'string') {
        coerced['expression'] = coerced['query'];
      }
    }

    if (properties['query'] && coerced['query'] === undefined) {
      if (typeof coerced['q'] === 'string') {
        coerced['query'] = coerced['q'];
      }
    }

    // Browser parameter name hallucinations repair
    if (properties['url'] && coerced['url'] === undefined) {
      const candidates = ['link', 'uri', 'address', 'target', 'site', 'website', 'dest', 'destination'];
      for (const cand of candidates) {
        if (typeof coerced[cand] === 'string') {
          coerced['url'] = coerced[cand];
          break;
        }
      }
    }

    if (properties['refId'] && coerced['refId'] === undefined) {
      const candidates = ['ref', 'target', 'id', 'element', 'elementId', 'selector', 'tag'];
      for (const cand of candidates) {
        if (typeof coerced[cand] === 'string') {
          coerced['refId'] = coerced[cand];
          break;
        }
      }
    }

    if (properties['tabId'] && coerced['tabId'] === undefined) {
      const candidates = ['tab', 'id', 'target', 'tab_id'];
      for (const cand of candidates) {
        if (typeof coerced[cand] === 'string') {
          coerced['tabId'] = coerced[cand];
          break;
        }
      }
    }

    if (properties['chord'] && coerced['chord'] === undefined) {
      const candidates = ['key', 'keys', 'button', 'press'];
      for (const cand of candidates) {
        if (typeof coerced[cand] === 'string') {
          coerced['chord'] = coerced[cand];
          break;
        }
      }
    }

    if (properties['direction'] && coerced['direction'] === undefined) {
      const candidates = ['dir', 'scroll'];
      for (const cand of candidates) {
        if (typeof coerced[cand] === 'string') {
          coerced['direction'] = coerced[cand];
          break;
        }
      }
    }

    if (properties['filePaths'] && coerced['filePaths'] === undefined) {
      if (Array.isArray(coerced['files'])) {
        coerced['filePaths'] = coerced['files'];
      } else if (typeof coerced['file'] === 'string') {
        coerced['filePaths'] = [coerced['file']];
      } else if (Array.isArray(coerced['paths'])) {
        coerced['filePaths'] = coerced['paths'];
      } else if (typeof coerced['filePath'] === 'string') {
        coerced['filePaths'] = [coerced['filePath']];
      } else if (typeof coerced['path'] === 'string') {
        coerced['filePaths'] = [coerced['path']];
      }
    }

    if (properties['scope'] && coerced['scope'] === 'full') {
      coerced['scope'] = 'all';
    }

    // 2. Safe type coercions per property
    for (const [propName, propSchema] of Object.entries(properties)) {
      const val = coerced[propName];
      if (val === undefined || val === null) continue;

      const propType = propSchema['type'];

      if (propType === 'boolean') {
        if (typeof val === 'string') {
          if (val.toLowerCase() === 'true') coerced[propName] = true;
          else if (val.toLowerCase() === 'false') coerced[propName] = false;
        } else if (typeof val === 'number') {
          coerced[propName] = val !== 0;
        }
      } else if (propType === 'number' || propType === 'integer') {
        if (typeof val === 'string' && /^-?\d+(\.\d+)?$/.test(val.trim())) {
          coerced[propName] = propType === 'integer' ? parseInt(val.trim(), 10) : parseFloat(val.trim());
        }
      } else if (propType === 'array' && !Array.isArray(val)) {
        if (typeof val === 'string') {
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) {
              coerced[propName] = parsed;
            } else if (parsed && typeof parsed === 'object') {
              coerced[propName] = [parsed];
            } else {
              coerced[propName] = [val];
            }
          } catch {
            // Try single-quote list repair (e.g. "['**/*']" -> ["**/*"])
            try {
              const repaired = val.replace(/'/g, '"');
              const parsed = JSON.parse(repaired);
              if (Array.isArray(parsed)) {
                coerced[propName] = parsed;
              } else {
                coerced[propName] = [parsed];
              }
            } catch {
              coerced[propName] = [val];
            }
          }
        } else {
          coerced[propName] = [val];
        }

        // For edits arrays in edit tools, repair missing search or replace
        if (propName === 'edits' && Array.isArray(coerced[propName])) {
          for (const item of coerced[propName] as Array<Record<string, unknown>>) {
            if (item && typeof item === 'object') {
              if (item['search'] === undefined && typeof item['replace'] === 'string') {
                item['search'] = '';
              } else if (item['replace'] === undefined && typeof item['search'] === 'string') {
                item['replace'] = '';
              }
            }
          }
        }
      } else if (propType === 'object' && (typeof val !== 'object' || val === null)) {
        if (typeof val === 'string') {
          try {
            const parsed = JSON.parse(val);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              coerced[propName] = parsed;
            }
          } catch {
            // retain
          }
        }
      } else if (propType === 'string' && typeof val === 'number') {
        coerced[propName] = String(val);
      } else if (propType === 'string' && typeof val === 'string') {
        // Repair double-escaped JSON strings emitted by local models (e.g. "{\"key\": \"val\"}" -> '{"key": "val"}')
        if (val.includes('\\"')) {
          try {
            const unescaped = val.replace(/\\"/g, '"');
            JSON.parse(unescaped);
            coerced[propName] = unescaped;
          } catch {
            // Not valid JSON after unescaping; preserve raw string
          }
        }
      }
    }

    return coerced;
  }

  public validateAndCoerce(
    tool: ToolDescriptor,
    rawArgs: Record<string, unknown> = {},
  ): ValidationResult {
    const coercedArgs = this.coerce(rawArgs, tool.inputSchema);

    // Get or compile validator
    let validator = this.validatorCache.get(tool.name);
    if (!validator) {
      try {
        const compiled = this.ajv.compile(tool.inputSchema);
        this.validatorCache.set(tool.name, compiled);
        validator = compiled;
      } catch {
        // Fallback for non-strict schemas
        return { valid: true, args: coercedArgs };
      }
    }

    if (!validator) {
      return { valid: true, args: coercedArgs };
    }

    const valid = validator(coercedArgs);
    if (valid) {
      return { valid: true, args: coercedArgs };
    }

    const errors = validator.errors || [];
    const formattedError = this.formatErrorMessage(tool, coercedArgs, errors);

    return {
      valid: false,
      error: formattedError,
      errors,
    };
  }

  public formatErrorMessage(
    tool: ToolDescriptor,
    sentArgs: Record<string, unknown>,
    errors: ErrorObject[],
  ): string {
    const lines: string[] = [`Tool call rejected: ${tool.name}`];

    for (const err of errors) {
      if (err.keyword === 'required') {
        const missingParam = (err.params as { missingProperty?: string }).missingProperty || 'field';
        const sentKeys = Object.keys(sentArgs);
        const sentHint = sentKeys.length > 0 ? ` (you sent [${sentKeys.join(', ')}])` : '';
        lines.push(`- \`${missingParam}\` is required${sentHint}`);
      } else if (err.keyword === 'type') {
        const field = err.instancePath.replace(/^\//, '') || 'value';
        const expectedType = (err.params as { type?: string }).type || 'unknown';
        lines.push(`- \`${field}\` must be ${expectedType}`);
      } else {
        const field = err.instancePath.replace(/^\//, '') || 'argument';
        lines.push(`- \`${field}\` ${err.message || 'is invalid'}`);
      }
    }

    const example = this.generateValidExample(tool.inputSchema);
    if (example) {
      lines.push(`Valid example: ${JSON.stringify(example)}`);
    }

    return lines.join('\n');
  }

  private generateValidExample(schema: Record<string, unknown>): Record<string, unknown> | null {
    const properties = (schema['properties'] || {}) as Record<string, Record<string, unknown>>;
    const required = (schema['required'] || []) as string[];

    const example: Record<string, unknown> = {};
    for (const reqKey of required) {
      const propSchema = properties[reqKey];
      if (!propSchema) {
        example[reqKey] = 'value';
        continue;
      }
      const pType = propSchema['type'];
      switch (pType) {
        case 'string':
          example[reqKey] = reqKey.includes('path') ? 'src/main.ts' : 'example';
          break;
        case 'number':
        case 'integer':
          example[reqKey] = reqKey.includes('line') ? 1 : 10;
          break;
        case 'boolean':
          example[reqKey] = true;
          break;
        case 'array':
          example[reqKey] = [];
          break;
        case 'object':
          example[reqKey] = {};
          break;
        default:
          example[reqKey] = 'value';
      }
    }

    return Object.keys(example).length > 0 ? example : null;
  }
}

export const toolValidator = new ToolValidator();

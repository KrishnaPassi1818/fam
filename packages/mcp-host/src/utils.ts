export function expandEnvVars(value: string): string {
  return value.replace(/\${([a-zA-Z0-9_]+)}|\$([a-zA-Z0-9_]+)/g, (_, p1, p2) => {
    const varName = (p1 || p2) as string;
    return process.env[varName] ?? '';
  });
}

export function expandRecordEnvVars(record?: Record<string, string>): Record<string, string> {
  if (!record) return {};
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(record)) {
    result[k] = expandEnvVars(v);
  }
  return result;
}

export function toValidAlias(name: string): string {
  // Replace dots, hyphens, slashes, spaces with underscores
  const sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
  // Ensure valid start and length up to 64 chars
  const trimmed = sanitized.substring(0, 64);
  return trimmed || 'tool';
}

import * as path from 'node:path';

export class OfficeSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfficeSecurityError';
  }
}

export interface PathResolution {
  resolvedPath: string;
  isOutsideWorkspace: boolean;
}

/**
 * Resolves a file path, ensuring security against null-bytes and directory traversal.
 * Checks whether the path is confined to the specified workspace root.
 */
export function resolveConfinedPath(
  inputPath: string,
  workspaceRoot: string = process.cwd(),
  allowOutside = true,
): PathResolution {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new OfficeSecurityError('Invalid file path: path must be a non-empty string');
  }

  // Reject null-byte injection
  if (inputPath.includes('\0')) {
    throw new OfficeSecurityError('Invalid file path: null byte detected');
  }

  const resolved = path.resolve(workspaceRoot, inputPath);
  const normalizedRoot = path.resolve(workspaceRoot);

  const isOutsideWorkspace = !resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot;

  if (isOutsideWorkspace && !allowOutside) {
    throw new OfficeSecurityError(
      `Path '${inputPath}' resolves outside workspace root '${normalizedRoot}'. Access denied.`,
    );
  }

  return {
    resolvedPath: resolved,
    isOutsideWorkspace,
  };
}

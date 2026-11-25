import * as path from 'node:path';
import * as os from 'node:os';

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

  let target = inputPath.trim();
  if (target === '~') {
    target = os.homedir();
  } else if (target.startsWith('~/')) {
    target = path.join(os.homedir(), target.slice(2));
  } else if (target.startsWith('home/') || target.startsWith('root/')) {
    target = '/' + target;
  }

  // If a path specifies root directory directly (e.g. "/proposal.docx"), models often
  // prepend '/' intending workspace root. Since root '/' is never writable by users,
  // interpret direct root children as workspace-relative.
  if (target.startsWith('/') && path.dirname(path.resolve(target)) === '/') {
    target = path.basename(target);
  }

  const resolved = path.resolve(workspaceRoot, target);
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

export * from './server.js';
export * from './safety/confinement.js';
export * from './safety/backup.js';
export * from './safety/verification.js';
export * from './safety/working-copy.js';
export * from './tools/read/index.js';
export * from './tools/sql/index.js';
export * from './tools/write/index.js';
export * from './tools/libreoffice/index.js';

import { runServer } from './server.js';

// If run directly as CLI binary
if (import.meta.url === `file://${process.argv[1]}`) {
  runServer().catch((err) => {
    console.error('Fatal error in office MCP server:', err);
    process.exit(1);
  });
}

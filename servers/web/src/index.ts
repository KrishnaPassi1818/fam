import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createWebServer } from './server.js';

async function main() {
  const server = createWebServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`fam-web server fatal: ${err}\n`);
  process.exit(1);
});

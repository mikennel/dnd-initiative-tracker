import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lanAddresses, startServer } from './start.ts';

const here = dirname(fileURLToPath(import.meta.url));
const production = process.env.NODE_ENV === 'production';
const dataDir = process.env.DATA_DIR ?? resolve(here, '../data');

const { ctx, port, close } = await startServer({
  dataDir,
  staticDir: production ? resolve(here, '../../web/dist') : undefined,
  port: Number(process.env.PORT ?? 5175),
  host: process.env.HOST ?? '0.0.0.0',
});
// In dev the browser talks to Vite (:5173), which proxies to us.
if (!production) ctx.lanUrls = lanAddresses().map((ip) => `http://${ip}:5173`);

console.log(`\n  ⚔  DnD Initiative Tracker server on http://localhost:${port}  (D&D Beyond: ${ctx.ddb.status})`);
if (production) {
  console.log(`  DM view:     http://localhost:${port}/`);
  for (const url of ctx.lanUrls) console.log(`  Table view:  ${url}/table`);
} else {
  console.log('  Dev mode: open the Vite URL (http://localhost:5173). The table view is at /table on the same host.');
  for (const url of ctx.lanUrls) console.log(`  LAN:         ${url}/table`);
}
console.log(`  Data:        ${dataDir}\n`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await close();
    process.exit(0);
  });
}

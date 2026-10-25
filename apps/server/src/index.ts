import { networkInterfaces } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.ts';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 5175);
const HOST = process.env.HOST ?? '0.0.0.0';
const production = process.env.NODE_ENV === 'production';

const ctx = await buildApp({
  dataDir: process.env.DATA_DIR ?? resolve(here, '../data'),
  staticDir: production ? resolve(here, '../../web/dist') : undefined,
  logger: false,
});

const lan = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => i!.address);
const webPort = production ? PORT : 5173;
ctx.lanUrls = lan.map((ip) => `http://${ip}:${webPort}`);

await ctx.app.listen({ port: PORT, host: HOST });
ctx.poller.start();

console.log(`\n  ⚔  DnD Initiative Tracker server on http://localhost:${PORT}  (D&D Beyond: ${ctx.ddb.status})`);
if (production) {
  console.log(`  DM view:     http://localhost:${PORT}/`);
  for (const url of ctx.lanUrls) console.log(`  Table view:  ${url}/table`);
} else {
  console.log('  Dev mode: open the Vite URL (http://localhost:5173). The table view is at /table on the same host.');
  for (const url of ctx.lanUrls) console.log(`  LAN:         ${url}/table`);
}
console.log(`  Data:        ${join(process.env.DATA_DIR ?? resolve(here, '../data'))}\n`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await ctx.app.close();
    process.exit(0);
  });
}

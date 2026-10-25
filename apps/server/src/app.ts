import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { DdbClient, type SecretStore } from './ddb/client.ts';
import { Hub } from './hub.ts';
import { registerRoutes } from './routes.ts';
import { FileSecretStore } from './secrets.ts';
import { Kv, openDb, type Db } from './store/db.ts';
import { EventStore } from './store/eventStore.ts';
import { PcPoller } from './sync/pcPoller.ts';

export interface AppOptions {
  dataDir: string;
  /** ':memory:' for tests. */
  dbPath?: string;
  secrets?: SecretStore;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  staticDir?: string;
  logger?: boolean;
}

export interface AppContext {
  app: FastifyInstance;
  db: Db;
  kv: Kv;
  store: EventStore;
  ddb: DdbClient;
  hub: Hub;
  poller: PcPoller;
  lanUrls: string[];
}

export async function buildApp(opts: AppOptions): Promise<AppContext> {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 5 * 1024 * 1024 });
  const db = openDb(opts.dbPath ?? join(opts.dataDir, 'tracker.db'));
  const kv = new Kv(db);
  const store = new EventStore(db);
  const ddb = new DdbClient(opts.secrets ?? new FileSecretStore(join(opts.dataDir, 'secrets.json')), kv, db, opts.fetchImpl);

  let poller: PcPoller;
  const hub = new Hub(store, kv, (ids) => poller.get(ids), () => void poller.tick());
  poller = new PcPoller(ddb, kv, () => hub.watchedCharacterIds(), (snaps, changed) => hub.pcUpdated(snaps, changed), opts.pollIntervalMs);

  const ctx: AppContext = { app, db, kv, store, ddb, hub, poller, lanUrls: [] };

  await app.register(fastifyWebsocket);
  app.get('/ws', { websocket: true }, (socket) => hub.attach(socket));
  registerRoutes(app, ctx);

  if (opts.staticDir && existsSync(opts.staticDir)) {
    await app.register(fastifyStatic, { root: opts.staticDir });
    // SPA fallback: client-side routes (/dm/..., /table) get index.html.
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
      return reply.status(404).send({ error: 'Not found' });
    });
  }

  app.addHook('onClose', async () => {
    poller.stop();
    db.close();
  });
  return ctx;
}

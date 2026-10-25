import { networkInterfaces } from 'node:os';
import { buildApp, type AppContext } from './app.ts';

export interface StartOptions {
  dataDir: string;
  /** Serve the built SPA from here (production and desktop). */
  staticDir?: string;
  port?: number;
  host?: string;
  /** Try the next ports if `port` is taken (the desktop app; a dev server may hold 5175). */
  portFallbacks?: number;
}

export interface RunningServer {
  ctx: AppContext;
  port: number;
  close: () => Promise<void>;
}

/** Build, listen and start polling. Shared by the CLI (`index.ts`) and the desktop app. */
export async function startServer(opts: StartOptions): Promise<RunningServer> {
  const ctx = await buildApp({ dataDir: opts.dataDir, staticDir: opts.staticDir, logger: false });
  const host = opts.host ?? '0.0.0.0';
  let port = opts.port ?? 5175;
  for (let attempt = 0; ; attempt++) {
    try {
      await ctx.app.listen({ port, host });
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE' || attempt >= (opts.portFallbacks ?? 0)) throw err;
      port++;
    }
  }
  ctx.lanUrls = lanAddresses().map((ip) => `http://${ip}:${port}`);
  ctx.poller.start();
  return {
    ctx,
    port,
    close: async () => {
      ctx.poller.stop();
      await ctx.app.close();
    },
  };
}

export function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i!.address);
}

// The Request Service's HTTP app, without listening or connecting to anything,
// so tests can build it with their own pool.
import { readdir } from 'node:fs/promises';
import express from 'express';
import type { Router } from 'express';
import type pg from 'pg';
import { errorHandler, notFound } from './http/errors.ts';
import { gatewayUser } from './http/gateway-user.ts';

export type AppDeps = {
  pool: pg.Pool;
};

// Every file in http/routes/ is one group of endpoints. Its default export
// takes the pool and returns a Router. Adding a file is enough to add its
// routes: this file doesn't change for a new endpoint.
export type RouteFactory = (pool: pg.Pool) => Router;

const ROUTES_DIR = new URL('./http/routes/', import.meta.url);

// Read once, when this module is first imported (top-level await), so
// createApp stays synchronous. Sorted by file name, so the order in which
// routers are mounted is the same on every machine.
const routeFactories = await loadRouteFactories();

async function loadRouteFactories(): Promise<RouteFactory[]> {
  const files = (await readdir(ROUTES_DIR)).filter((f) => f.endsWith('.ts')).sort();
  const factories: RouteFactory[] = [];
  for (const file of files) {
    const mod = (await import(new URL(file, ROUTES_DIR).href)) as { default?: unknown };
    if (typeof mod.default !== 'function') {
      throw new Error(`http/routes/${file}: needs a default export (pool) => Router`);
    }
    factories.push(mod.default as RouteFactory);
  }
  return factories;
}

export function createApp({ pool }: AppDeps): express.Express {
  const app = express();
  app.disable('x-powered-by');

  // For the compose healthcheck, before the gateway headers are required.
  // Caddy never routes /health, so it isn't public.
  app.get('/health', (_req, res) => { res.json({ status: 'ok' }); });

  app.use(express.json());
  app.use(gatewayUser);

  for (const factory of routeFactories) app.use(factory(pool));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

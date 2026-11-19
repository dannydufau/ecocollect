// The Request Service's HTTP app, without listening or connecting to anything,
// so tests can build it with their own pool.
import express from 'express';
import type pg from 'pg';
import { errorHandler, notFound } from './http/errors.ts';
import { gatewayUser } from './http/gateway-user.ts';
import { listsRouter } from './http/routes/lists.ts';

export type AppDeps = {
  pool: pg.Pool;
};

export function createApp({ pool }: AppDeps): express.Express {
  const app = express();
  app.disable('x-powered-by');

  // For the compose healthcheck, before the gateway headers are required.
  // Caddy never routes /health, so it isn't public.
  app.get('/health', (_req, res) => { res.json({ status: 'ok' }); });

  app.use(express.json());
  app.use(gatewayUser);

  app.use(listsRouter(pool));               // Q1, Q2

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

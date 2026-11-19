// The Request Service's HTTP app, without listening or connecting to anything,
// so tests can build it with their own pool.
import express from 'express';
import type pg from 'pg';
import { errorHandler, notFound } from './http/errors.ts';
import { gatewayUser } from './http/gateway-user.ts';

export type AppDeps = {
  pool: pg.Pool;
};

export function createApp(_deps: AppDeps): express.Express {
  const app = express();
  app.disable('x-powered-by');

  // For the compose healthcheck, before the gateway headers are required.
  // Caddy never routes /health, so it isn't public.
  app.get('/health', (_req, res) => { res.json({ status: 'ok' }); });

  app.use(express.json());
  app.use(gatewayUser);

  // Routers (Q1, Q2, ...) are added here and get what they need from _deps.

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

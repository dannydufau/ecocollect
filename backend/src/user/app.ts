import express from 'express';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { errorHandler, notFound } from './http/errors.ts';
import firebase from './auth/firebase.cjs';
import authRoutes from './auth/router.cjs';

const defaultRoutesDir = fileURLToPath(new URL('./routes/', import.meta.url));

export async function createApp({ routesDir = defaultRoutesDir, auth }: { routesDir?: string; auth?: Parameters<typeof authRoutes.createAuthRouter>[0] } = {}): Promise<express.Express> {
  const app = express();
  app.disable('x-powered-by');
  app.get('/health', (_req, res) => { res.json({ status: 'ok' }); });
  // Sessions keep their own JSON parser and error response.
  let authRouter: ReturnType<typeof authRoutes.createAuthRouter> | undefined;
  app.use((req, res, next) => {
    if (!/^(?:\/api\/session|\/verify)\/?$/.test(req.path)) return next();
    authRouter ??= authRoutes.createAuthRouter(auth ?? firebase.getFirebaseAuth());
    return authRouter(req, res, next);
  });
  app.use(express.json());

  const entries = await readdir(routesDir, { withFileTypes: true });
  const routeFiles = entries.filter(entry => entry.isFile() && /\.(ts|js|mjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts'))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of routeFiles) {
    const route = await import(pathToFileURL(path.join(routesDir, entry.name)).href);
    if (typeof route.register !== 'function') throw new Error(`User route ${entry.name} must export register(app).`);
    await route.register(app);
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

// Mock of the EcoCollect gateway API for local frontend development.
// Run: npm run mock   (listens on http://localhost:8080, which GATEWAY_URL points to)
// Every file in mock/routes/ exports register(route, store, { notify, emitPublic }) and adds its own routes.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { store, seed, sendError } from "./store.mjs";
import { notify } from "./routes/notifications.mjs";
import { emitPublic } from "./routes/accounts.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

// route(method, "/api/things/:id", handler). The first route that matches wins.
function createRouter() {
  const routes = [];
  function route(method, pattern, handler) {
    const names = [];
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const source = escaped.replace(/:(\w+)/g, (_, name) => {
      names.push(name);
      return "([^/]+)";
    });
    routes.push({ method, regex: new RegExp(`^${source}/?$`), names, handler });
  }
  function find(method, pathname) {
    for (const r of routes) {
      const m = r.regex.exec(pathname);
      if (r.method === method && m) {
        const params = Object.fromEntries(r.names.map((name, i) => [name, decodeURIComponent(m[i + 1])]));
        return { handler: r.handler, params };
      }
    }
    return null;
  }
  return { route, find };
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => resolve(raw));
  });
}

// legacy.mjs goes last so a new route file always beats an old route on the same path
async function loadRoutes(routesDir, route) {
  const files = fs.readdirSync(routesDir).filter((f) => f.endsWith(".mjs")).sort();
  files.sort((a, b) => (a === "legacy.mjs") - (b === "legacy.mjs"));
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(routesDir, file)).href);
    mod.register(route, store, { notify, emitPublic });
  }
}

export async function startServer({ port = Number(process.env.MOCK_PORT ?? 8080), routesDir = path.join(here, "routes") } = {}) {
  seed();
  const { route, find } = createRouter();
  await loadRoutes(routesDir, route);

  async function handle(req, res) {
    const url = new URL(req.url, "http://localhost");
    let found;
    try {
      found = find(req.method, url.pathname);
    } catch {
      // decodeURIComponent throws on a bad % escape like /api/things/%E0
      return sendError(res, 400, "invalid_path", "The path has a bad % escape");
    }
    if (!found) return sendError(res, 404, "not_found", "Not found");

    const raw = await readBody(req);
    let body;
    try {
      body = raw ? JSON.parse(raw) : undefined;
    } catch {
      return sendError(res, 400, "invalid_json", "The body is not valid JSON");
    }
    await found.handler(req, res, { params: found.params, url, body });
  }

  const server = http.createServer((req, res) => {
    res.on("finish", () => console.log(`${req.method} ${req.url} -> ${res.statusCode}`));
    handle(req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) sendError(res, 500, "mock_error", "Mock server error");
    });
  });
  await new Promise((resolve) => server.listen(port, resolve));
  return server;
}

// Start the server when this file is run directly (npm run mock)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await startServer();
  console.log(`Mock API on http://localhost:${server.address().port}`);
}

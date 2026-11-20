// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startServer } from "./server.mjs";
import { store } from "./store.mjs";

const routeFile = `
export function register(route, store, { notify, emitPublic }) {
  route("GET", "/api/notify-type", (req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ type: typeof notify, emit: typeof emitPublic }));
  });
  route("GET", "/api/things/:id", (req, res, { params }) => {
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ id: params.id }));
  });
  route("POST", "/api/echo", (req, res, { body }) => {
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(body));
  });
  route("DELETE", "/api/session", (req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ from: "new route" }));
  });
}
`;

let server: Server | undefined;
const dirs: string[] = [];

// Starts the mock on a free port with a temp routes folder (inside mock/ so Vitest can import from it)
async function start(withOlder = false) {
  const dir = fs.mkdtempSync(path.join(__dirname, "tmp-routes-"));
  dirs.push(dir);
  fs.writeFileSync(path.join(dir, "things.mjs"), routeFile);
  fs.copyFileSync(path.join(__dirname, "routes", "notifications.mjs"), path.join(dir, "notifications.mjs"));
  if (withOlder) fs.writeFileSync(path.join(dir, "zz-older.mjs"), `export function register(route) {
  route("DELETE", "/api/session", (req, res) => res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ from: "older route" })));
}`);
  server = await startServer({ port: 0, routesDir: dir });
  return `http://localhost:${(server!.address() as AddressInfo).port}`;
}

afterEach(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve(null)));
  server = undefined;
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("mock server", () => {
  it("returns 404 with the error envelope for an unknown path", async () => {
    const base = await start();
    const res = await fetch(`${base}/api/nope`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "Not found" } });
  });

  it("loads a route file without editing server.mjs", async () => {
    const base = await start();
    const res = await fetch(`${base}/api/echo`, { method: "POST", body: JSON.stringify({ hello: "world" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hello: "world" });
  });

  it("gives every route file the notify and emitPublic helpers", async () => {
    const base = await start();
    const res = await fetch(`${base}/api/notify-type`);
    expect(await res.json()).toEqual({ type: "function", emit: "function" });
  });

  it("passes :id params to the handler", async () => {
    const base = await start();
    const res = await fetch(`${base}/api/things/abc-123`);
    expect(await res.json()).toEqual({ id: "abc-123" });
  });

  it("returns 400 invalid_json for a bad body", async () => {
    const base = await start();
    const res = await fetch(`${base}/api/echo`, { method: "POST", body: "{not json" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_json");
  });

  it("passes a multipart body to the handler without reading it as JSON", async () => {
    const base = await start();
    const form = new FormData();
    form.append("file", new Blob(["photo"]), "a.jpg");
    const res = await fetch(`${base}/api/echo`, { method: "POST", body: form });
    expect(res.status).toBe(200);
  });

  it("returns 400 for a bad % escape in a :id path", async () => {
    const base = await start();
    const res = await fetch(`${base}/api/things/%E0`);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_path");
  });

  it("uses the first route file by name when two files have the same path", async () => {
    const base = await start(true);
    const res = await fetch(`${base}/api/session`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ from: "new route" });
  });

  it("forgets an event stream when the client disconnects", async () => {
    const base = await start();
    const controller = new AbortController();
    const res = await fetch(`${base}/api/events`, { headers: { Authorization: "Bearer demo-resident-1" }, signal: controller.signal });
    expect(res.status).toBe(200);
    await res.body!.getReader().read();
    expect(store.sseConnections.get("demo-resident-1")?.size).toBe(1);
    controller.abort();
    await vi.waitFor(() => expect(store.sseConnections.get("demo-resident-1")?.size).toBe(0));
  });
});

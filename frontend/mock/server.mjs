// Mock of the EcoCollect gateway API for local frontend development.
// Follows contracts/openapi.yaml and asyncapi.yaml. Data lives in memory only.
// Run: npm run mock   (listens on http://localhost:8080, which GATEWAY_URL points to)
import http from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.MOCK_PORT ?? 8080);
const TZ = "America/Edmonton";
const DAY_MS = 24 * 60 * 60 * 1000;

// Same ids, names and weights as scripts/seed/data.js
const CATEGORIES = {
  laptops: { name: "Computers/Laptops", kg: 2.5 },
  desktops: { name: "Computers/Desktops", kg: 8.0 },
  monitors: { name: "Monitors", kg: 5.0 },
  tvs: { name: "Televisions", kg: 12.0 },
  phones: { name: "Phones", kg: 0.2 },
  tablets: { name: "Tablets", kg: 0.5 },
  printers: { name: "Printers", kg: 6.0 },
  "small-appliances": { name: "Small Appliances", kg: 3.0 },
  "cables-chargers": { name: "Cables and Chargers", kg: 0.3 },
  "other-electronics": { name: "Other Electronics", kg: 1.0 },
};

// Postal codes of the seeded users (scripts/seed/data.js). Unknown users get T2P1J9.
const PROFILES = {
  "demo-resident-1": { postalCode: "T2P1J9" },
  "demo-resident-2": { postalCode: "T3A0B1" },
  "demo-resident-3": { postalCode: "T2Y3K5" },
  "demo-resident-4": { postalCode: "T2N1N4" },
  "demo-resident-5": { postalCode: "T3K2L7" },
  "demo-volunteer-1": { preferred: ["T2P1J9"] },
  "demo-volunteer-2": { preferred: ["T3A0B1"] },
  "demo-volunteer-3": { preferred: ["T2E5A8"] },
  "demo-volunteer-4": { preferred: ["T2T4M3"] },
  "demo-volunteer-5": { preferred: ["T3G1H6"] },
};

const requests = []; // newest last
const connections = new Map(); // uid -> Set of { res, roles }

// ---------- helpers ----------

// Reads the uid and roles from a Firebase ID token WITHOUT checking the signature.
// Only acceptable in a mock: the real gateway verifies the token.
function decodeToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    const uid = payload.user_id ?? payload.sub;
    return uid ? { uid, roles: Array.isArray(payload.roles) ? payload.roles : [] } : null;
  } catch {
    return null;
  }
}

function userFromBearer(req) {
  const m = /^Bearer (.+)$/i.exec(req.headers.authorization ?? "");
  return m ? decodeToken(m[1]) : null;
}

function userFromCookie(req) {
  const m = /(?:^|;\s*)session=([^;]+)/.exec(req.headers.cookie ?? "");
  return m ? decodeToken(decodeURIComponent(m[1])) : null;
}

function send(res, status, body) {
  if (body === undefined) {
    res.writeHead(status).end();
    return;
  }
  res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : undefined);
      } catch {
        resolve(Symbol.for("invalid"));
      }
    });
  });
}

// UTC instant of a Calgary local date + hour, e.g. ("2026-10-30", 14).
function calgaryInstant(date, hour) {
  const [y, mo, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, mo - 1, d, hour);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit" })
      .formatToParts(new Date(guess))
      .map((p) => [p.type, p.value]),
  );
  const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour);
  return new Date(guess - (shown - guess));
}

function validate(body, now, expiresAt) {
  if (body === Symbol.for("invalid")) return "body is not valid JSON";
  if (!body || typeof body !== "object") return "body is required";
  const { items, windows, safetyAcknowledged } = body;
  if (!Array.isArray(items) || items.length === 0) return "items must have at least one item";
  for (const item of items) {
    if (!CATEGORIES[item?.categoryId]) return `unknown categoryId: ${item?.categoryId}`;
    if (!Number.isInteger(item.quantity) || item.quantity < 1) return "quantity must be a whole number of at least 1";
    if (item.categoryId === "other-electronics" && !/\S/.test(item.description ?? "")) return "other-electronics needs a description";
  }
  if (!Array.isArray(windows) || windows.length < 1 || windows.length > 3) return "windows must have 1 to 3 entries";
  const dates = new Set();
  for (const w of windows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(w?.date ?? "")) return "window date must be YYYY-MM-DD";
    if (!Number.isInteger(w.startHour) || w.startHour < 0 || w.startHour > 23) return "startHour must be a whole number from 0 to 23";
    if (dates.has(w.date)) return "window dates must all be different";
    dates.add(w.date);
    const start = calgaryInstant(w.date, w.startHour);
    if (start <= now) return "every window must start in the future";
    if (start >= expiresAt) return "every window must start before expiresAt (30 days)";
  }
  if (safetyAcknowledged !== true) return "safetyAcknowledged must be true";
  return null;
}

function isAvailable(r, now) {
  return r.status === "Open" && new Date(r.expiresAt) > now && r.windows.some((w) => calgaryInstant(w.date, w.startHour) > now);
}

function signal(uid, type, requestId) {
  for (const conn of connections.get(uid) ?? []) {
    conn.res.write(`event: signal\ndata: ${JSON.stringify({ type, requestId })}\n\n`);
  }
}

// Volunteers whose preferred postal codes include the request's code (contract 6.2).
// Volunteers who are not in PROFILES (not seeded) get every request.
function matchedVolunteers(postalCode, residentUid) {
  const uids = [];
  for (const [uid, conns] of connections) {
    if (uid === residentUid) continue;
    const isVolunteer = [...conns].some((c) => c.roles.includes("volunteer"));
    const preferred = PROFILES[uid]?.preferred;
    if (isVolunteer && (!preferred || preferred.includes(postalCode))) uids.push(uid);
  }
  return uids;
}

// ---------- routes ----------

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  const route = `${req.method} ${url.pathname}`;
  const now = new Date();

  if (route === "POST /api/session") {
    const body = await readJson(req);
    const user = typeof body?.idToken === "string" ? decodeToken(body.idToken) : null;
    if (!user) return send(res, 401, { error: "idToken missing or invalid" });
    res.setHeader("Set-Cookie", `session=${encodeURIComponent(body.idToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=432000`);
    return send(res, 204);
  }
  if (route === "DELETE /api/session") {
    res.setHeader("Set-Cookie", "session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    return send(res, 204);
  }

  if (route === "GET /api/events") {
    const user = userFromCookie(req);
    if (!user) return send(res, 401, { status: 401, error: "Unauthorized" });
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(": connected\n\n");
    const conn = { res, roles: user.roles };
    if (!connections.has(user.uid)) connections.set(user.uid, new Set());
    connections.get(user.uid).add(conn);
    const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
    req.on("close", () => {
      clearInterval(ping);
      connections.get(user.uid)?.delete(conn);
    });
    return;
  }

  if (url.pathname === "/api/requests") {
    const user = userFromBearer(req);
    if (!user) return send(res, 401, { status: 401, error: "Unauthorized" });

    if (req.method === "POST") {
      if (!user.roles.includes("resident")) return send(res, 403, { error: "only residents can create requests" });
      const body = await readJson(req);
      const expiresAt = new Date(now.getTime() + 30 * DAY_MS);
      const problem = validate(body, now, expiresAt);
      if (problem) return send(res, 400, { error: problem });

      const postalCode = PROFILES[user.uid]?.postalCode ?? "T2P1J9";
      const created = body.items.map((item) => ({
        requestId: randomUUID(),
        residentUid: user.uid,
        categoryId: item.categoryId,
        quantity: item.quantity,
        estimatedWeightKg: Math.round(item.quantity * CATEGORIES[item.categoryId].kg * 100) / 100,
        status: "Open",
        postalCode,
        windows: body.windows.map(({ date, startHour }) => ({ date, startHour })),
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      }));
      requests.push(...created);

      // Like the outbox + RabbitMQ + notification service, but instant.
      setTimeout(() => {
        for (const r of created) {
          signal(r.residentUid, "REQUEST_CREATED", r.requestId);
          for (const uid of matchedVolunteers(r.postalCode, r.residentUid)) signal(uid, "NEW_MATCHING_REQUEST", r.requestId);
        }
      }, 500);

      return send(res, 201, {
        requests: created.map(({ requestId, categoryId, quantity, estimatedWeightKg, status, createdAt, expiresAt }) => ({
          requestId, categoryId, quantity, estimatedWeightKg, status, createdAt, expiresAt,
        })),
      });
    }

    if (req.method === "GET") {
      const view = url.searchParams.get("view");
      if (view === "mine") {
        if (!user.roles.includes("resident")) return send(res, 403, { error: "view=mine needs the resident role" });
        if (url.searchParams.has("postalCodes")) return send(res, 400, { error: "postalCodes is not allowed with view=mine" });
        const status = url.searchParams.get("status");
        return send(
          res,
          200,
          requests
            .filter((r) => r.residentUid === user.uid && (!status || r.status === status))
            .reverse()
            .map((r) => ({
              requestId: r.requestId, category: CATEGORIES[r.categoryId].name, quantity: r.quantity,
              estimatedWeightKg: r.estimatedWeightKg, status: r.status, createdAt: r.createdAt, expiresAt: r.expiresAt,
            })),
        );
      }
      if (view === "available") {
        if (!user.roles.includes("volunteer")) return send(res, 403, { error: "view=available needs the volunteer role" });
        if (url.searchParams.has("status")) return send(res, 400, { error: "status is not allowed with view=available" });
        let codes = null;
        if (url.searchParams.has("postalCodes")) {
          codes = url.searchParams.get("postalCodes").split(",").map((c) => c.replace(/\s/g, "").toUpperCase()).filter(Boolean);
          if (codes.length === 0 || codes.length > 10 || codes.some((c) => !/^T[0-9][A-Z][0-9][A-Z][0-9]$/.test(c))) {
            return send(res, 400, { error: "postalCodes must be 1 to 10 valid codes" });
          }
        }
        return send(
          res,
          200,
          requests
            .filter((r) => isAvailable(r, now) && (!codes || codes.includes(r.postalCode)))
            .reverse()
            .map((r) => ({
              requestId: r.requestId, category: CATEGORIES[r.categoryId].name, quantity: r.quantity,
              estimatedWeightKg: r.estimatedWeightKg, postalCode: r.postalCode, windows: r.windows, expiresAt: r.expiresAt,
            })),
        );
      }
      return send(res, 400, { error: "view must be mine or available" });
    }
  }

  return send(res, 404, { status: 404, error: "Not found" });
}

http
  .createServer((req, res) => {
    res.on("finish", () => console.log(`${req.method} ${req.url} -> ${res.statusCode}`));
    handle(req, res).catch((err) => {
      console.error(err);
      if (!res.headersSent) send(res, 500, { error: "mock server error" });
    });
  })
  .listen(PORT, () => console.log(`Mock API on http://localhost:${PORT}`));
// In-memory data for the mock API, plus the helpers every route file uses.

// Same people as scripts/seed/data.js
const DEMO_ACCOUNTS = [
  { uid: "demo-resident-1", displayName: "Riley R.", roles: ["resident"], postalCode: "T2P1J9" },
  { uid: "demo-resident-2", displayName: "Rosa R.", roles: ["resident"], postalCode: "T3A0B1" },
  { uid: "demo-resident-3", displayName: "Ravi R.", roles: ["resident"], postalCode: "T2Y3K5" },
  { uid: "demo-resident-4", displayName: "Rena R.", roles: ["resident"], postalCode: "T2N1N4" },
  { uid: "demo-resident-5", displayName: "Rory R.", roles: ["resident", "volunteer"], postalCode: "T3K2L7", preferredPostalCodes: [] },
  { uid: "demo-volunteer-1", displayName: "Vera V.", roles: ["volunteer"], postalCode: "T2P1J9", preferredPostalCodes: ["T2P1J9"] },
  { uid: "demo-volunteer-2", displayName: "Victor V.", roles: ["volunteer"], postalCode: "T3A0B1", preferredPostalCodes: ["T3A0B1"] },
  { uid: "demo-volunteer-3", displayName: "Vince V.", roles: ["volunteer"], postalCode: "T2E5A8", preferredPostalCodes: ["T2E5A8"] },
  { uid: "demo-volunteer-4", displayName: "Violet V.", roles: ["volunteer"], postalCode: "T2T4M3", preferredPostalCodes: ["T2T4M3"] },
  { uid: "demo-volunteer-5", displayName: "Vikram V.", roles: ["volunteer"], postalCode: "T3G1H6", preferredPostalCodes: ["T3G1H6"] },
];

export const store = {
  accounts: [],
  requests: [],
  assignments: [],
  notifications: [],
  notificationsSeeded: false, // notifications.mjs adds its demo data on the first request
  awards: [],
  terms: [],
  sseConnections: new Map(), // uid -> Set of open event streams
  publicConnections: new Set(), // streams of the public pages: { res, profile, stats }
};

// Puts the store back to its starting data.
export function seed() {
  store.accounts = DEMO_ACCOUNTS.map((a) => ({ ...a }));
  store.requests = [];
  store.assignments = [];
  store.notifications = [];
  store.notificationsSeeded = false;
  store.awards = [];
  store.terms = [];
  store.sseConnections = new Map();
  store.publicConnections = new Set();
}

export function now() {
  return new Date();
}

// The contract error format: { error: { code, message, details: { fields } } }
export function sendError(res, status, code, message, fields) {
  const error = { code, message };
  if (fields) error.details = { fields };
  res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify({ error }));
}

// Any token is accepted. It is only read, never checked, because this is a mock.
export function currentUser(req) {
  const bearer = /^Bearer (.+)$/i.exec(req.headers.authorization ?? "");
  const cookie = /(?:^|;\s*)session=([^;]+)/.exec(req.headers.cookie ?? "");
  const token = bearer ? bearer[1] : cookie && decodeURIComponent(cookie[1]);
  if (!token) return null;

  let claims = {};
  try {
    claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  } catch {
    // not a JWT, so the whole token is used as the uid
  }
  const uid = claims.user_id ?? claims.sub ?? token;
  const account = store.accounts.find((a) => a.uid === uid);
  return { uid, roles: Array.isArray(claims.roles) ? claims.roles : (account?.roles ?? []), account };
}

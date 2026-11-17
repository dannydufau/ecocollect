import { currentUser, sendError } from "../store.mjs";

function authenticate(req, res) {
  const user = currentUser(req);
  if (!req.headers.authorization?.startsWith("Bearer ") || !user || user.account?.deactivatedAt) {
    sendError(res, 401, "unauthorized", "Please log in again.");
    return null;
  }
  return user;
}

function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { body: "Send a request body." };
  const fields = {};
  if (typeof body.endpoint !== "string" || !URL.canParse(body.endpoint)) fields.endpoint = "Send a valid endpoint URL.";
  const keys = body.keys && typeof body.keys === "object" ? body.keys : {};
  if (typeof keys.p256dh !== "string" || !keys.p256dh) fields["keys.p256dh"] = "Send the p256dh key.";
  if (typeof keys.auth !== "string" || !keys.auth) fields["keys.auth"] = "Send the auth key.";
  if (body.expirationTime != null && typeof body.expirationTime !== "number") fields.expirationTime = "Send a number or null.";
  return Object.keys(fields).length ? fields : null;
}

export function register(route, store) {
  route("POST", "/api/push/subscriptions", (req, res, { body }) => {
    const user = authenticate(req, res);
    if (!user) return;
    const fields = validate(body);
    if (fields) return sendError(res, 400, "validation_error", "Check the highlighted fields.", fields);
    const entry = { uid: user.uid, endpoint: body.endpoint, keys: { p256dh: body.keys.p256dh, auth: body.keys.auth }, expirationTime: body.expirationTime ?? null };
    const index = store.pushSubscriptions.findIndex((item) => item.uid === user.uid && item.endpoint === body.endpoint);
    if (index === -1) store.pushSubscriptions.push(entry);
    else store.pushSubscriptions[index] = entry;
    res.writeHead(201).end();
  });

  route("DELETE", "/api/push/subscriptions", (req, res, { body }) => {
    const user = authenticate(req, res);
    if (!user) return;
    if (typeof body?.endpoint !== "string" || !body.endpoint) {
      return sendError(res, 400, "validation_error", "Check the highlighted fields.", { endpoint: "Send the endpoint." });
    }
    store.pushSubscriptions = store.pushSubscriptions.filter((item) => !(item.uid === user.uid && item.endpoint === body.endpoint));
    res.writeHead(204).end();
  });
}

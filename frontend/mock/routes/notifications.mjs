// N1, N3, N4 and N5 (contracts README section 13), plus notify() for the other mock files.
import { randomUUID } from "node:crypto";
import { currentUser, now, send, sendError, store } from "../store.mjs";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const PING_MS = 25_000;

function authenticate(req, res) {
  const user = currentUser(req);
  if (!user || user.account?.deactivatedAt) {
    sendError(res, 401, "unauthorized", "Please log in again.");
    return null;
  }
  return user;
}

function writeEvent(uid, name, data, id) {
  for (const connection of store.sseConnections.get(uid) ?? []) {
    connection.res.write(`${id ? `id: ${id}\n` : ""}event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}

// README 13.3: every stream of a volunteer hears that the list of open requests changed. The notification types below
// are the ones sent when a request is created, changed, accepted, cancelled or expires (a reopened request counts too).
const AVAILABLE_CHANGES = new Set(["REQUEST_CREATED", "REQUEST_UPDATED_RESIDENT", "REQUEST_ASSIGNED_RESIDENT", "REQUEST_CANCELLED_RESIDENT", "REQUEST_EXPIRED_RESIDENT"]);

function availableChanged(requestId) {
  for (const connections of store.sseConnections.values()) {
    for (const connection of connections) {
      if (connection.roles.includes("volunteer")) connection.res.write(`event: available-requests-changed\ndata: ${JSON.stringify({ requestId })}\n\n`);
    }
  }
}

// The paging cursor is only a timestamp (13.4), so two notifications must never share one
function newTimestamp() {
  const latest = Math.max(0, ...store.notifications.map((item) => Date.parse(item.createdAt)));
  return new Date(Math.max(now().getTime(), latest + 1)).toISOString();
}

// Stores a notification for the user and sends it to every open stream of theirs (13.3). A deactivated account gets none.
/** @param {string} userId @param {{ type: string, requestId?: string | null, awardId?: string | null, title: string, body: string, url: string }} data */
export function notify(userId, { type, requestId = null, awardId = null, title, body, url }) {
  if (store.accounts.find((account) => account.uid === userId)?.deactivatedAt) return null;
  const notification = {
    notificationId: randomUUID(), userId, type, requestId, awardId, title, body, url,
    isRead: false, createdAt: newTimestamp(),
  };
  store.notifications.push(notification);
  const notificationId = notification.notificationId;
  writeEvent(userId, "notification", { notificationId, type, requestId, awardId, title, body, url, createdAt: notification.createdAt }, notificationId);
  if (AVAILABLE_CHANGES.has(type)) availableChanged(requestId);
  return notification;
}

// Six notifications of different types. Done on the first request, because the demo requests are created by resident.mjs.
function seedNotifications() {
  const requestOf = (uid, status) => store.requests.find((request) => request.residentUid === uid && request.status === status)?.requestId ?? null;
  const awardOf = (uid) => store.awards.find((award) => award.accountId === uid)?.awardId ?? randomUUID();
  const page = (id, role) => (id ? `/${role}/requests/${id}` : `/${role}`);
  const open = requestOf("demo-resident-1", "Open");
  const assigned = requestOf("demo-resident-1", "Assigned");
  const collected = requestOf("demo-resident-1", "Collected");
  const delivered = requestOf("demo-resident-1", "Delivered");
  const missed = requestOf("demo-resident-1", "Missed");
  const seeded = [
    ["demo-resident-1", "REQUEST_ASSIGNED_RESIDENT", assigned, null, "Your pickup was accepted", "Vera V. will collect 2 × Computers/Laptops.", page(assigned, "resident"), 2 * HOUR, false],
    ["demo-resident-1", "REQUEST_DELIVERED_RESIDENT", delivered, null, "Your items were delivered", "2 × Computers/Laptops reached the facility.", page(delivered, "resident"), 2 * DAY, true],
    ["demo-resident-1", "ECOPOINTS_AWARDED_ON_DELIVERY_RESIDENT", null, awardOf("demo-resident-1"), "You earned EcoPoints", "Your delivery earned you points.", "/ecopoints", 2 * DAY - 5 * 60 * 1000, false],
    ["demo-volunteer-1", "NEW_MATCHING_REQUEST", open, null, "New pickup near you", "2 × Computers/Laptops in T2P1J9", page(open, "volunteer"), 30 * 60 * 1000, false],
    ["demo-volunteer-1", "REQUEST_COLLECTED_VOLUNTEER", collected, null, "Pickup collected", "Deliver 2 × Computers/Laptops to a facility.", page(collected, "volunteer"), 5 * HOUR, false],
    ["demo-volunteer-1", "ASSIGNMENT_MISSED_VOLUNTEER", missed, null, "A pickup was marked missed", "The resident reported that the pickup did not happen.", "/volunteer/history", 3 * DAY, true],
  ];
  for (const [userId, type, requestId, awardId, title, body, url, age, isRead] of seeded) {
    store.notifications.push({
      notificationId: randomUUID(), userId, type, requestId, awardId, title, body, url,
      isRead, createdAt: new Date(now().getTime() - age).toISOString(),
    });
  }
}

function ensureSeeded() {
  if (store.notificationsSeeded) return;
  store.notificationsSeeded = true;
  seedNotifications();
}

export function register(route) {
  route("GET", "/api/events", (req, res) => {
    const user = authenticate(req, res);
    if (!user) return;
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" });
    res.write("event: ready\ndata: {}\n\n");
    const connection = { res, roles: user.roles };
    if (!store.sseConnections.has(user.uid)) store.sseConnections.set(user.uid, new Set());
    store.sseConnections.get(user.uid).add(connection);
    const ping = setInterval(() => res.write(": ping\n\n"), PING_MS);
    // The request's own close event does not fire when the client leaves, the response's does
    res.on("close", () => {
      clearInterval(ping);
      store.sseConnections.get(user.uid)?.delete(connection);
    });
  });

  route("GET", "/api/notifications", (req, res, { url }) => {
    const user = authenticate(req, res);
    if (!user) return;
    ensureSeeded();
    const fields = {};
    const before = url.searchParams.get("before");
    if (before !== null && Number.isNaN(Date.parse(before))) fields.before = "Use an ISO date and time.";
    const limitText = url.searchParams.get("limit");
    const limit = limitText === null ? 30 : Number(limitText);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) fields.limit = "Use a whole number from 1 to 100.";
    if (Object.keys(fields).length) return sendError(res, 400, "validation_failed", "Check the query.", fields);

    const mine = store.notifications.filter((item) => item.userId === user.uid);
    const page = mine
      .filter((item) => before === null || Date.parse(item.createdAt) < Date.parse(before))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, limit)
      .map(({ notificationId, type, requestId, awardId, title, body, url, isRead, createdAt }) => ({
        notificationId, type, requestId, awardId, title, body, url, isRead, createdAt,
      }));
    send(res, 200, { unreadCount: mine.filter((item) => !item.isRead).length, notifications: page });
  });

  // The mock cannot tell which stream the request came from, so every stream of the user gets the read message
  route("PATCH", "/api/notifications/:id/read", (req, res, { params }) => {
    const user = authenticate(req, res);
    if (!user) return;
    ensureSeeded();
    const notification = store.notifications.find((item) => item.notificationId === params.id && item.userId === user.uid);
    if (!notification) return sendError(res, 404, "not_found", "This notification does not exist.");
    notification.isRead = true;
    writeEvent(user.uid, "notification-read", { notificationIds: [notification.notificationId] });
    res.writeHead(204).end();
  });

  route("POST", "/api/notifications/read-all", (req, res) => {
    const user = authenticate(req, res);
    if (!user) return;
    ensureSeeded();
    for (const item of store.notifications) if (item.userId === user.uid) item.isRead = true;
    writeEvent(user.uid, "notification-read", { all: true });
    res.writeHead(204).end();
  });
}

import { randomUUID } from "node:crypto";
import { currentUser, now, sendError } from "../store.mjs";
import { buildDetail, requestSummary, windowStart } from "../detail.mjs";
import { registerResidentActions } from "../resident-actions.mjs";
import { volunteerList } from "./volunteer.mjs";
import { fixtureAccounts, fixtureRequests, longUsername } from "../fixtures.mjs";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const STATUSES = ["Open", "Assigned", "Collected", "Delivered", "Cancelled", "Expired", "Missed"];

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
}

function authenticate(req, res, role) {
  const user = currentUser(req);
  if (!req.headers.authorization?.startsWith("Bearer ") || !user || user.account?.deactivatedAt) {
    sendError(res, 401, "unauthorized", "Please log in again.");
    return null;
  }
  if (role && !user.roles.includes(role)) {
    sendError(res, 403, "forbidden", "This action needs the resident role.");
    return null;
  }
  return user;
}

function extraFields(value, allowed, prefix, fields) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fields[`${prefix}${key}`] = "This field is not allowed.";
  }
}

function validate(body, timestamp, categories, createdAt = timestamp) {
  const fields = Object.create(null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return { body: "Send a request body." };
  extraFields(body, ["items", "windows", "notes", "termsDocumentId"], "", fields);
  if (typeof body.termsDocumentId !== "string" || !body.termsDocumentId.trim()) fields.termsDocumentId = "Accept the terms.";
  if (body.notes !== undefined && typeof body.notes !== "string") fields.notes = "Enter text.";
  else if (typeof body.notes === "string" && body.notes.length > 500) fields.notes = "Must be 500 characters or fewer.";
  if (!Array.isArray(body.items) || !body.items.length) fields.items = "Add at least one category.";
  else {
    const selected = new Set();
    body.items.forEach((item, index) => {
      const path = `items[${index}]`;
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        fields[path] = "Choose a category and quantity.";
        return;
      }
      extraFields(item, ["categoryId", "quantity", "photo"], `${path}.`, fields);
      if (!categories.some((category) => category.categoryId === item.categoryId)) fields[`${path}.categoryId`] = "Choose a category.";
      else if (selected.has(item.categoryId)) fields[`${path}.categoryId`] = "Already selected.";
      selected.add(item.categoryId);
      if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) fields[`${path}.quantity`] = "Enter a positive whole number.";
      if (item.photo !== undefined) {
        if (!item.photo || typeof item.photo !== "object" || Array.isArray(item.photo) ||
            typeof item.photo.fileId !== "string" || !item.photo.fileId.trim()) fields[`${path}.photo.fileId`] = "Choose an uploaded photo.";
        else extraFields(item.photo, ["fileId"], `${path}.photo.`, fields);
      }
    });
  }
  if (!Array.isArray(body.windows) || body.windows.length < 1 || body.windows.length > 3) fields.windows = "Choose one to three windows.";
  else {
    const slots = new Set();
    body.windows.forEach((window, index) => {
      const path = `windows[${index}]`;
      if (!window || typeof window !== "object" || Array.isArray(window)) {
        fields[path] = "Choose a date and hour.";
        return;
      }
      extraFields(window, ["date", "startHour"], `${path}.`, fields);
      const parsed = new Date(`${window.date}T12:00:00Z`);
      if (typeof window.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(window.date) ||
          Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== window.date) {
        fields[`${path}.date`] = "Choose a valid date.";
        return;
      }
      if (!Number.isInteger(window.startHour) || window.startHour < 0 || window.startHour > 23) {
        fields[`${path}.startHour`] = "Choose an hour from 0 to 23.";
        return;
      }
      const start = windowStart(window.date, window.startHour).getTime();
      const slot = `${window.date}-${window.startHour}`;
      if (slots.has(slot)) fields[path] = "Choose a different date or hour.";
      else if (start <= timestamp) fields[path] = "Choose a future pickup window.";
      else if (start + HOUR > createdAt + 30 * DAY) fields[path] = "The window must end within 30 days.";
      slots.add(slot);
    });
  }
  return fields;
}

function seedRequests(store) {
  const timestamp = now().getTime();
  const { resident, volunteer, both } = fixtureAccounts;
  const fixtures = [
    { status: "Open", id: fixtureRequests.Open, residentUid: resident, days: 1 },
    { status: "Assigned", id: fixtureRequests.Assigned, residentUid: resident, volunteerId: volunteer, days: 2 },
    { status: "Collected", id: fixtureRequests.Collected, residentUid: resident, volunteerId: volunteer, days: -2 },
    { status: "Delivered", id: fixtureRequests.Delivered, residentUid: resident, volunteerId: volunteer, days: -3 },
    { status: "Cancelled", id: fixtureRequests.Cancelled, residentUid: resident, volunteerId: volunteer, days: -3 },
    { status: "Expired", id: fixtureRequests.Expired, residentUid: resident, days: -4 },
    { status: "Missed", id: fixtureRequests.Missed, residentUid: resident, volunteerId: volunteer, days: -4 },
    { status: "Cancelled", id: fixtureRequests.bothResident, residentUid: both, days: -4 },
    { status: "Assigned", id: fixtureRequests.bothVolunteer, residentUid: longUsername, volunteerId: both, days: 2 },
  ];
  for (const { status, id, residentUid, volunteerId, days } of fixtures) {
    const owner = store.accounts.find((account) => account.uid === residentUid);
    const date = new Date(timestamp + days * DAY);
    const fixtureKey = id.slice(1);
    const window = { windowId: `2${fixtureKey}`, date: date.toISOString().slice(0, 10), startHour: 14 };
    const start = windowStart(window.date, window.startHour).getTime();
    const createdAt = new Date(timestamp - 7 * DAY).toISOString();
    const request = {
      requestId: id, residentUid, categoryId: "laptops", quantity: 2,
      estimatedWeightKg: 5, status, postalCode: owner.postalCode,
      address: { ...owner.address }, notes: "Side door",
      windows: [window], createdAt, expiresAt: new Date(start).toISOString(),
      termsDocumentId: store.terms.at(-1).termsDocumentId,
      statusHistory: [{ status: "Open", changedAt: createdAt, reason: null }],
    };
    if (volunteerId) {
      const assignment = {
        assignmentId: `3${fixtureKey}`, requestId: request.requestId, volunteerId,
        window, acceptedAt: new Date(timestamp - 6 * DAY).toISOString(),
        collectedAt: null, endedAt: null, endReason: null,
        termsDocumentId: store.terms.at(-1).termsDocumentId,
      };
      request.statusHistory.push({ status: "Assigned", changedAt: assignment.acceptedAt, reason: null });
      if (["Collected", "Delivered"].includes(status)) {
        assignment.collectedAt = new Date(start + HOUR / 2).toISOString();
        request.statusHistory.push({ status: "Collected", changedAt: assignment.collectedAt, reason: null });
      }
      if (["Delivered", "Missed", "Cancelled"].includes(status)) {
        assignment.endedAt = new Date(start + (status === "Cancelled" ? -2 : 2) * HOUR).toISOString();
        assignment.endReason = status === "Delivered" ? "Delivered" : status === "Cancelled" ? "Resident_Cancelled" : "Missed_Pickup";
        request.statusHistory.push({ status, changedAt: assignment.endedAt, reason: null });
      }
      if (status === "Delivered") request.delivery = {
        facility: { facilityId: "mock-facility-1", name: "Demo Recycling Facility" },
        deliveredAt: assignment.endedAt, evidencePhoto: { fileId: "mock-delivery-evidence" },
      };
      store.assignments.push(assignment);
    } else if (status === "Cancelled" || status === "Expired") {
      request.statusHistory.push({ status, changedAt: request.expiresAt, reason: null });
    }
    store.requests.push(request);
  }
}

export function register(route, store, { notify = () => {} } = {}) {
  store.categories = [
    ["laptops", "Computers/Laptops", "Electronics", 2.5],
    ["desktops", "Computers/Desktops", "Electronics", 8],
    ["monitors", "Monitors", "Displays", 5],
    ["tvs", "Televisions", "Displays", 12],
    ["phones", "Phones", "Mobile Devices", 0.2],
    ["tablets", "Tablets", "Mobile Devices", 0.5],
    ["printers", "Printers", "Printers", 6],
    ["small-appliances", "Small Appliances", "Small Appliances", 3],
    ["cables-chargers", "Cables and Chargers", "Accessories", 0.3],
  ].map(([categoryId, name, wasteType, standardWeightKg]) => ({ categoryId, name, wasteType, standardWeightKg }));
  for (const account of store.accounts) {
    if (account.roles.includes("resident") && !account.address) {
      account.address = { street: "123 4 Ave SW", postalCode: account.postalCode };
    }
  }
  if (!store.terms.length) store.terms.push({ termsDocumentId: "mock-terms-1", content: "Mock terms for local testing.", publishedAt: now().toISOString() });
  if (!store.requests.length) seedRequests(store);
  store.termsAcceptances = [];
  const savedResponses = new Map();

  route("GET", "/api/categories", (req, res) => {
    if (authenticate(req, res)) send(res, 200, store.categories);
  });

  route("POST", "/api/requests", (req, res, { body }) => {
    const user = authenticate(req, res, "resident");
    if (!user) return;
    const timestamp = now().getTime();
    const key = req.headers["idempotency-key"];
    const cacheKey = JSON.stringify([user.uid, key]);
    const saved = savedResponses.get(cacheKey);
    if (key && saved && timestamp - saved.timestamp < DAY) return send(res, 201, saved.body);
    const fields = validate(body, timestamp, store.categories);
    if (Object.keys(fields).length) return sendError(res, 400, "validation_failed", "Check the request fields.", fields);
    if (body.termsDocumentId !== store.terms.at(-1).termsDocumentId) return sendError(res, 409, "terms_outdated", "The terms have changed. Please read and accept them again.");
    if (!user.account?.address) return sendError(res, 403, "forbidden", "A resident profile is required.");
    const createdAt = new Date(timestamp).toISOString();
    const expiresAt = new Date(Math.max(...body.windows.map((window) => windowStart(window.date, window.startHour).getTime()))).toISOString();
    const acceptanceId = randomUUID();
    const created = body.items.map((item) => ({
      requestId: randomUUID(), residentUid: user.uid, categoryId: item.categoryId, quantity: item.quantity,
      estimatedWeightKg: Math.round(item.quantity * store.categories.find((category) => category.categoryId === item.categoryId).standardWeightKg * 100) / 100,
      status: "Open", createdAt, expiresAt, notes: body.notes ?? null,
      address: { street: user.account.address.street, postalCode: user.account.address.postalCode },
      postalCode: user.account.address.postalCode,
      windows: body.windows.map(({ date, startHour }) => ({ windowId: randomUUID(), date, startHour })),
      photo: item.photo ? { fileId: item.photo.fileId } : null,
      termsDocumentId: body.termsDocumentId, termsAcceptanceId: acceptanceId,
      statusHistory: [{ status: "Open", changedAt: createdAt, reason: null }],
    }));
    store.termsAcceptances.push({ termsAcceptanceId: acceptanceId, accountId: user.uid,
      termsDocumentId: body.termsDocumentId, type: "AT_RESIDENT_REQUEST_CREATION", acceptedAt: createdAt });
    store.requests.push(...created);
    for (const request of created) {
      const body = `${request.quantity} × ${store.categories.find((category) => category.categoryId === request.categoryId).name}`;
      notify(user.uid, { type: "REQUEST_CREATED", requestId: request.requestId, title: "Request sent", body, url: `/resident/requests/${request.requestId}` });
      const volunteers = store.accounts.filter((account) => account.uid !== user.uid && account.roles.includes("volunteer") && !account.deactivatedAt && account.preferredPostalCodes?.includes(request.postalCode));
      for (const volunteer of volunteers) {
        notify(volunteer.uid, { type: "NEW_MATCHING_REQUEST", requestId: request.requestId, title: "New pickup near you", body: `${body} in ${request.postalCode}`, url: `/volunteer/requests/${request.requestId}` });
      }
    }
    const response = { requests: created.map((request) => requestSummary(store, request)) };
    if (key) savedResponses.set(cacheKey, { timestamp, body: response });
    send(res, 201, response);
  });

  route("GET", "/api/requests", (req, res, context) => {
    const { url } = context;
    if (["available", "volunteer"].includes(url.searchParams.get("view"))) return volunteerList(req, res, context);
    if (url.searchParams.get("view") !== "mine") return sendError(res, 400, "validation_failed", "Choose a valid view.", { view: "Use mine, available or volunteer." });
    const user = authenticate(req, res, "resident");
    if (!user) return;
    const status = url.searchParams.get("status");
    const filters = status?.split(",");
    if ((filters && filters.some((value) => !STATUSES.includes(value))) ||
        url.searchParams.has("postalCodes") || url.searchParams.has("assignmentStatus")) {
      return sendError(res, 400, "validation_failed", "Choose a valid request status.", { status: "Invalid filter." });
    }
    const requests = store.requests
      .filter((request) => request.residentUid === user.uid && (!filters || filters.includes(request.status)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((request) => ({ ...requestSummary(store, request), hasPhoto: Boolean(request.photo) }));
    send(res, 200, requests);
  });

  route("GET", "/api/requests/:id", (req, res, { params }) => {
    const user = authenticate(req, res);
    if (!user) return;
    const request = store.requests.find((item) => item.requestId === params.id);
    const detail = buildDetail(store, request, user.uid);
    if (!detail) return sendError(res, 404, "request_unavailable", "This request is no longer available.");
    send(res, 200, detail);
  });
  registerResidentActions(route, store, { authenticate, send, validate, notify });
}

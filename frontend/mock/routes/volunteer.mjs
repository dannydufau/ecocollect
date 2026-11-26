// Q2, Q6, Q7, Q11, Q12 (volunteer side) and Q15. Q8 is buildDetail in detail.mjs.
import { randomUUID } from "node:crypto";
import { currentUser, now, send, sendError, store } from "../store.mjs";
import { buildDetail, requestSummary, windowStart } from "../detail.mjs";
import { textFor } from "../notification-text.mjs";

const HISTORY = ["Volunteer_Cancelled", "Resident_Cancelled", "Missed_Pickup"];
const ASSIGNMENT_STATUSES = ["Active", "Collected", "Delivered", ...HISTORY];

function authenticate(req, res, role) {
  const user = currentUser(req);
  if (!req.headers.authorization?.startsWith("Bearer ") || !user || user.account?.deactivatedAt) {
    sendError(res, 401, "unauthorized", "Please log in again.");
    return null;
  }
  if (role && !user.roles.includes(role)) {
    sendError(res, 403, "forbidden", "This action needs the volunteer role.");
    return null;
  }
  return user;
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function extraFields(body, allowed) {
  return Object.fromEntries(Object.keys(body).filter((key) => !allowed.includes(key)).map((key) => [key, "This field is not allowed."]));
}

function setStatus(request, status, timestamp, reason = null) {
  request.status = status;
  request.statusHistory.push({ status, changedAt: timestamp, reason });
}

function notifyResident(notify, request, type) {
  notify(request.residentUid, { type, requestId: request.requestId, ...textFor(type, request), url: `/resident/requests/${request.requestId}` });
}

function notifyVolunteer(notify, request, assignment, type, ended = false) {
  notify(assignment.volunteerId, { type, requestId: request.requestId, ...textFor(type, request), url: ended ? "/volunteer/history" : `/volunteer/requests/${request.requestId}` });
}

function futureWindows(request, time) {
  return request.windows.filter((window) => window.isActive !== false && windowStart(window.date, window.startHour).getTime() > time);
}

function assignmentStatus(assignment) {
  return assignment.endReason ?? (assignment.collectedAt ? "Collected" : "Active");
}

// resident.mjs owns GET /api/requests and sends view=available (Q6) and view=volunteer (Q7) here
export function volunteerList(req, res, { url }) {
  const user = authenticate(req, res, "volunteer");
  if (!user) return;
  const params = url.searchParams;
  const time = now().getTime();

  if (params.get("view") === "available") {
    const codes = params.get("postalCodes")?.split(",").map((code) => code.trim()).filter(Boolean) ?? [];
    if (params.has("status") || params.has("assignmentStatus")) {
      return sendError(res, 400, "validation_failed", "These filters are not allowed here.", { [params.has("status") ? "status" : "assignmentStatus"]: "Not allowed with view=available." });
    }
    if (codes.length > 10) return sendError(res, 400, "validation_failed", "Choose at most 10 postal codes.", { postalCodes: "Choose at most 10 postal codes." });
    const rows = store.requests
      .filter((request) => request.status === "Open" && Date.parse(request.expiresAt) > time && (!codes.length || codes.includes(request.postalCode)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((request) => {
        const { requestId, category, quantity, estimatedWeightKg, expiresAt } = requestSummary(store, request);
        const windows = futureWindows(request, time).map(({ windowId, date, startHour }) => ({ windowId, date, startHour }));
        return { requestId, category, quantity, estimatedWeightKg, postalCode: request.postalCode, windows, expiresAt, hasPhoto: Boolean(request.photo) };
      });
    return send(res, 200, rows);
  }

  const filters = params.get("assignmentStatus")?.split(",");
  if (filters?.some((value) => !ASSIGNMENT_STATUSES.includes(value)) || params.has("status") || params.has("postalCodes")) {
    return sendError(res, 400, "validation_failed", "Choose a valid assignment status.", { assignmentStatus: "Invalid filter." });
  }
  const rows = store.assignments
    .filter((assignment) => assignment.volunteerId === user.uid && (!filters || filters.includes(assignmentStatus(assignment))))
    .sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt))
    .map((assignment) => {
      const request = store.requests.find((item) => item.requestId === assignment.requestId);
      const linked = !HISTORY.includes(assignment.endReason);
      const summary = requestSummary(store, request);
      return {
        requestId: request.requestId,
        category: linked ? summary.category : null,
        quantity: linked ? request.quantity : null,
        estimatedWeightKg: linked ? request.estimatedWeightKg : null,
        postalCode: linked ? request.postalCode : null,
        status: linked ? request.status : null,
        assignment: {
          assignmentId: assignment.assignmentId,
          window: { windowId: assignment.window.windowId, date: assignment.window.date, startHour: assignment.window.startHour },
          status: assignmentStatus(assignment),
          acceptedAt: assignment.acceptedAt,
          collectedAt: assignment.collectedAt ?? null,
          endedAt: assignment.endedAt ?? null,
          endReason: assignment.endReason ?? null,
        },
      };
    });
  send(res, 200, rows);
}

// Q12 for the volunteer side. resident-actions.mjs calls this first; false means the resident path handles it.
export function cancelAsVolunteer(req, res, { params, body = {} }, notify = () => {}) {
  const user = currentUser(req);
  const request = store.requests.find((item) => item.requestId === params.id);
  if (!req.headers.authorization?.startsWith("Bearer ") || !user || user.account?.deactivatedAt || !request) return false;
  if (!user.roles.includes("volunteer") || (request.residentUid === user.uid && body?.as !== "volunteer")) return false;

  if (!buildDetail(store, request, user.uid)) {
    sendError(res, 404, "request_unavailable", "This request is no longer available.");
    return true;
  }
  const fields = isObject(body) ? extraFields(body, ["as", "reason"]) : { body: "Send an object." };
  if (isObject(body) && body.reason !== undefined && typeof body.reason !== "string") fields.reason = "Enter text.";
  if (Object.keys(fields).length) {
    sendError(res, 400, "validation_failed", "Some fields are invalid.", fields);
    return true;
  }
  const assignment = store.assignments.find((item) => item.requestId === request.requestId && !item.endedAt);
  const error = !assignment ? [409, "no_active_assignment", "There is no active assignment."]
    : assignment.volunteerId !== user.uid ? [403, "forbidden", "Only the assigned volunteer can do this."]
    : assignment.collectedAt ? [409, "already_collected", "The items have already been collected."] : null;
  if (error) {
    sendError(res, ...error);
    return true;
  }

  const timestamp = now().toISOString();
  assignment.endedAt = timestamp;
  assignment.endReason = "Volunteer_Cancelled";
  const reopened = Date.parse(timestamp) < Date.parse(request.expiresAt);
  setStatus(request, reopened ? "Open" : "Expired", timestamp, body.reason ?? null);
  notifyResident(notify, request, "ASSIGNMENT_CANCELLED_BY_VOLUNTEER_RESIDENT");
  notifyVolunteer(notify, request, assignment, "ASSIGNMENT_CANCELLED_BY_VOLUNTEER_VOLUNTEER", true);
  notifyResident(notify, request, reopened ? "REQUEST_UPDATED_RESIDENT" : "REQUEST_EXPIRED_RESIDENT");
  // an expired request is hidden from the volunteer, so they get only the summary
  send(res, 200, buildDetail(store, request, user.uid) ?? requestSummary(store, request));
  return true;
}

function seedFacilities() {
  const ids = (types) => store.categories.filter((category) => types.includes(category.wasteType)).map((category) => category.categoryId);
  store.facilities = [
    { facilityId: "mock-facility-1", name: "Demo Recycling Facility", street: "2808 Ogden Rd SE", postalCode: "T2G4R7",
      specialInstructions: "Use the loading dock at the back.", acceptedCategoryIds: store.categories.map((category) => category.categoryId) },
    { facilityId: "mock-facility-2", name: "North Electronics Depot", street: "1100 64 Ave NE", postalCode: "T2E7Y5",
      specialInstructions: null, acceptedCategoryIds: ids(["Electronics", "Displays"]) },
    { facilityId: "mock-facility-3", name: "Phone and Cable Drop-off", street: "350 7 Ave SW", postalCode: "T2P3N9",
      specialInstructions: "Bring items to the front counter.", acceptedCategoryIds: ids(["Mobile Devices", "Accessories"]) },
    ...[
      ["West Electronics Depot", "1100 69 St SW", "T3H4Y7"],
      ["South Electronics Depot", "250 Shawville Blvd SE", "T2Y2Z7"],
      ["East Electronics Depot", "4300 17 Ave SE", "T2A0T2"],
      ["Central Electronics Depot", "800 10 Ave SW", "T2R0A9"],
    ].map(([name, street, postalCode], index) => ({
      facilityId: `mock-facility-${index + 4}`, name, street, postalCode, specialInstructions: null,
      acceptedCategoryIds: ids(["Electronics"]),
    })),
  ];
}

export function register(route, _store, { notify = () => {} } = {}) {
  seedFacilities();

  route("GET", "/api/facilities", (req, res, { url }) => {
    if (!authenticate(req, res, "volunteer")) return;
    const categoryId = url.searchParams.get("categoryId");
    send(res, 200, store.facilities.filter((facility) => !categoryId || facility.acceptedCategoryIds.includes(categoryId)));
  });

  route("POST", "/api/requests/:id/assignment", (req, res, { params, body }) => {
    const user = authenticate(req, res, "volunteer");
    if (!user) return;
    const request = store.requests.find((item) => item.requestId === params.id);
    if (!request) return sendError(res, 404, "request_unavailable", "This request is no longer available.");
    const fields = isObject(body) ? extraFields(body, ["windowId", "termsDocumentId"]) : { body: "Send an object." };
    if (isObject(body)) {
      if (typeof body.windowId !== "string" || !body.windowId) fields.windowId = "Choose a window.";
      if (typeof body.termsDocumentId !== "string" || !body.termsDocumentId) fields.termsDocumentId = "Accept the terms.";
    }
    if (Object.keys(fields).length) return sendError(res, 400, "validation_failed", "Some fields are invalid.", fields);
    const timestamp = now().toISOString();
    const time = Date.parse(timestamp);
    if (request.status === "Assigned") return sendError(res, 409, "already_assigned", "Another volunteer accepted this request first.");
    if (request.status !== "Open") return sendError(res, 409, "not_open", "This request is no longer open.");
    // an overdue Open request is expired instead of accepted (12.6)
    if (time >= Date.parse(request.expiresAt)) {
      setStatus(request, "Expired", timestamp);
      notifyResident(notify, request, "REQUEST_EXPIRED_RESIDENT");
      return sendError(res, 409, "expired", "This request has expired.");
    }
    const window = futureWindows(request, time).find((item) => item.windowId === body.windowId);
    if (!window) return sendError(res, 400, "validation_failed", "Some fields are invalid.", { windowId: "must be an active window of this request that has not started" });
    if (body.termsDocumentId !== store.terms.at(-1).termsDocumentId) return sendError(res, 409, "terms_outdated", "The terms have changed. Please read and accept them again.");

    const assignment = {
      assignmentId: randomUUID(), requestId: request.requestId, volunteerId: user.uid,
      window: { windowId: window.windowId, date: window.date, startHour: window.startHour },
      acceptedAt: timestamp, collectedAt: null, endedAt: null, endReason: null, termsDocumentId: body.termsDocumentId,
    };
    store.assignments.push(assignment);
    store.termsAcceptances.push({ termsAcceptanceId: randomUUID(), accountId: user.uid, termsDocumentId: body.termsDocumentId,
      type: "AT_VOLUNTEER_ACCEPTANCE", acceptedAt: timestamp });
    setStatus(request, "Assigned", timestamp);
    notifyResident(notify, request, "REQUEST_ASSIGNED_RESIDENT");
    notifyVolunteer(notify, request, assignment, "REQUEST_ASSIGNED_VOLUNTEER");
    send(res, 201, buildDetail(store, request, user.uid));
  });

  route("POST", "/api/requests/:id/assignment/delivery", (req, res, { params, body }) => {
    const user = authenticate(req, res, "volunteer");
    if (!user) return;
    const request = store.requests.find((item) => item.requestId === params.id);
    if (!request || !buildDetail(store, request, user.uid)) return sendError(res, 404, "request_unavailable", "This request is no longer available.");
    const facility = store.facilities.find((item) => item.facilityId === body?.facilityId);
    const fields = isObject(body) ? extraFields(body, ["facilityId", "evidencePhoto"]) : { body: "Send an object." };
    if (isObject(body)) {
      if (!facility) fields.facilityId = "unknown facility";
      else if (!facility.acceptedCategoryIds.includes(request.categoryId)) fields.facilityId = "does not accept this category";
      const photo = body.evidencePhoto;
      if (!isObject(photo) || typeof photo.fileId !== "string" || !photo.fileId.trim()) fields["evidencePhoto.fileId"] = "must be an uploaded file id";
    }
    if (Object.keys(fields).length) return sendError(res, 400, "validation_failed", "Some fields are invalid.", fields);
    const assignment = store.assignments
      .filter((item) => item.requestId === request.requestId && item.volunteerId === user.uid)
      .find((item) => !item.endedAt || item.endReason === "Delivered");
    if (!assignment) return sendError(res, 403, "forbidden", "Only the assigned volunteer can do this.");
    if (request.status === "Delivered") return sendError(res, 409, "already_delivered", "This delivery has already been recorded.");
    if (request.status !== "Collected") return sendError(res, 409, "not_collected", "Confirm the collection before recording a delivery.");

    const timestamp = now().toISOString();
    assignment.endedAt = timestamp;
    assignment.endReason = "Delivered";
    request.delivery = { facility: { facilityId: facility.facilityId, name: facility.name }, deliveredAt: timestamp, evidencePhoto: { fileId: body.evidencePhoto.fileId } };
    setStatus(request, "Delivered", timestamp);
    notifyResident(notify, request, "REQUEST_DELIVERED_RESIDENT");
    notifyVolunteer(notify, request, assignment, "REQUEST_DELIVERED_VOLUNTEER");
    send(res, 200, buildDetail(store, request, user.uid));
  });
}

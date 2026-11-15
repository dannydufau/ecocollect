import { randomUUID } from "node:crypto";
import { now, sendError } from "./store.mjs";
import { buildDetail, requestSummary, windowStart } from "./detail.mjs";
import { awardCancellation } from "./routes/rewards.mjs";

const HOUR = 3600000;
const emptyNotify = () => {};

export function registerResidentActions(route, store, { authenticate, send, validate, notify = emptyNotify }) {
  function notifyResident(request, type) {
    notify(request.residentUid, { type, requestId: request.requestId, title: "Pickup updated", body: "Your pickup request has changed.", url: `/resident/requests/${request.requestId}` });
  }
  function notifyVolunteer(request, assignment, type, ended = false) {
    notify(assignment.volunteerId, { type, requestId: request.requestId, title: "Pickup updated", body: "Your pickup has changed.", url: ended ? "/volunteer/history" : `/volunteer/requests/${request.requestId}` });
  }
  function status(request, value, timestamp, reason = null) {
    request.status = value;
    request.statusHistory.push({ status: value, changedAt: timestamp, reason });
  }
  function expires(windows) {
    return new Date(Math.max(...windows.filter(window => window.isActive !== false).map(window => windowStart(window.date, window.startHour).getTime()))).toISOString();
  }
  function replaceWindows(request, windows) {
    request.windows.forEach(window => { window.isActive = false; });
    request.windows.push(...windows.map(({ date, startHour }) => ({ windowId: randomUUID(), date, startHour })));
    request.expiresAt = expires(request.windows);
  }
  function input(body, allowed) {
    const fields = {};
    if (!body || typeof body !== "object" || Array.isArray(body)) return { body: "Send an object." };
    for (const key of Object.keys(body)) if (!allowed.includes(key)) fields[key] = "This field is not allowed.";
    if (body.reason !== undefined && typeof body.reason !== "string") fields.reason = "Enter text.";
    return fields;
  }
  function invalid(res, fields) {
    if (!Object.keys(fields).length) return false;
    sendError(res, 400, "validation_error", "Check the request fields.", fields);
    return true;
  }
  function windowErrors(request, windows, timestamp, createdAt = Date.parse(request.createdAt)) {
    const fields = validate({ items: [{ categoryId: request.categoryId, quantity: request.quantity }], windows, termsDocumentId: "validation" }, timestamp, store.categories, createdAt);
    return Object.fromEntries(Object.entries(fields).filter(([key]) => key.startsWith("windows")));
  }
  function context(req, res, id) {
    const user = authenticate(req, res);
    if (!user) return null;
    const request = store.requests.find(item => item.requestId === id);
    if (!buildDetail(store, request, user.uid)) {
      sendError(res, 404, "request_unavailable", "This request is no longer available.");
      return null;
    }
    if (request.residentUid !== user.uid) {
      sendError(res, 403, "forbidden", "Only the resident can do this.");
      return null;
    }
    const assignment = store.assignments.find(item => item.requestId === id && !item.endedAt);
    const timestamp = now().toISOString();
    return { user, request, assignment, timestamp, time: Date.parse(timestamp) };
  }
  function overdue(request, time, res, timestamp) {
    if (request.status !== "Open" || time < Date.parse(request.expiresAt)) return false;
    status(request, "Expired", timestamp);
    notifyResident(request, "REQUEST_EXPIRED_RESIDENT");
    sendError(res, 409, "expired", "This request has expired.");
    return true;
  }
  function ended(assignment, time) {
    return time >= windowStart(assignment.window.date, assignment.window.startHour).getTime() + HOUR;
  }
  function endAssignment(assignment, timestamp, reason) {
    assignment.endedAt = timestamp;
    assignment.endReason = reason;
    if (reason === "Resident_Cancelled") awardCancellation(store, assignment);
  }
  function weightFor(request) {
    const category = store.categories.find(item => item.categoryId === request.categoryId);
    return Math.round(request.quantity * category.standardWeightKg * 100) / 100;
  }
  function validPhoto(photo) {
    if (photo === null) return true;
    if (typeof photo !== "object" || Array.isArray(photo)) return false;
    return typeof photo.fileId === "string" && photo.fileId.trim() !== "" && Object.keys(photo).length === 1;
  }
  function windowEnded(res) {
    sendError(res, 409, "window_ended", "The pickup window has ended. Confirm the collection or report a missed pickup.");
  }

  route("PATCH", "/api/requests/:id", (req, res, { params, body }) => {
    const ctx = context(req, res, params.id);
    if (!ctx) return;
    const { request, time, timestamp } = ctx;
    if (overdue(request, time, res, timestamp)) return;
    if (request.status !== "Open") return sendError(res, 409, "not_open", "This request can't be edited now.");
    const fields = input(body, ["categoryId", "quantity", "notes", "windows", "photo"]);
    if (body && typeof body === "object" && !Array.isArray(body)) {
      if (body.categoryId !== undefined && !store.categories.some(category => category.categoryId === body.categoryId)) fields.categoryId = "Choose a category.";
      if (body.quantity !== undefined && (!Number.isSafeInteger(body.quantity) || body.quantity < 1)) fields.quantity = "Enter a positive whole number.";
      if (body.notes !== undefined && body.notes !== null && typeof body.notes !== "string") fields.notes = "Enter text.";
      if (body.windows !== undefined) Object.assign(fields, windowErrors(request, body.windows, time));
      if (body.photo !== undefined && !validPhoto(body.photo)) fields.photo = "Choose an uploaded photo.";
    }
    if (invalid(res, fields)) return;
    for (const key of ["categoryId", "quantity", "notes", "photo"]) if (body[key] !== undefined) request[key] = body[key];
    if (body.categoryId !== undefined || body.quantity !== undefined) request.estimatedWeightKg = weightFor(request);
    if (body.windows !== undefined) replaceWindows(request, body.windows);
    notifyResident(request, "REQUEST_UPDATED_RESIDENT");
    send(res, 200, buildDetail(store, request, ctx.user.uid));
  });

  route("POST", "/api/requests/:id/cancel", (req, res, { params, body = {} }) => {
    const ctx = context(req, res, params.id);
    if (!ctx) return;
    const { request, assignment, timestamp, time } = ctx;
    if (overdue(request, time, res, timestamp)) return;
    if (!["Open", "Assigned"].includes(request.status)) return sendError(res, 409, "not_cancellable", "This request can't be cancelled now.");
    if (request.status === "Assigned" && (!assignment || ended(assignment, time))) return windowEnded(res);
    if (invalid(res, input(body, ["reason"]))) return;
    if (assignment) {
      endAssignment(assignment, timestamp, "Resident_Cancelled");
      notifyResident(request, "ASSIGNMENT_CANCELLED_BY_RESIDENT_RESIDENT");
      notifyVolunteer(request, assignment, "ASSIGNMENT_CANCELLED_BY_RESIDENT_VOLUNTEER", true);
    }
    status(request, "Cancelled", timestamp, body.reason ?? null);
    notifyResident(request, "REQUEST_CANCELLED_RESIDENT");
    send(res, 200, buildDetail(store, request, ctx.user.uid));
  });

  route("POST", "/api/requests/:id/assignment/cancel", (req, res, { params, body = {} }) => {
    const ctx = context(req, res, params.id);
    if (!ctx) return;
    const { request, assignment, user, time, timestamp } = ctx;
    const fields = input(body, ["as", "reason", "windows"]);
    if (invalid(res, fields)) return;
    const owner = request.residentUid === user.uid;
    const volunteer = assignment?.volunteerId === user.uid;
    if (body.as !== undefined && !["resident", "volunteer"].includes(body.as)) return sendError(res, 400, "validation_error", "Choose a role.", { as: "Choose resident or volunteer." });
    if (owner && volunteer && body.as === undefined) return sendError(res, 400, "validation_error", "Choose a role.", { as: "Choose resident or volunteer." });
    const as = body.as ?? "resident";
    if (as !== "resident") return sendError(res, 403, "forbidden", "Use the resident role for this action.");
    if (!assignment) return sendError(res, 409, "no_active_assignment", "There is no active assignment.");
    if (assignment.collectedAt || request.status === "Collected") return sendError(res, 409, "already_collected", "The items have already been collected.");
    if (ended(assignment, time)) return windowEnded(res);
    if (body.windows !== undefined) {
      if (invalid(res, windowErrors(request, body.windows, time))) return;
    }
    if (body.windows !== undefined) replaceWindows(request, body.windows);
    endAssignment(assignment, timestamp, "Resident_Cancelled");
    const newStatus = time < Date.parse(request.expiresAt) ? "Open" : "Expired";
    status(request, newStatus, timestamp, body.reason ?? null);
    notifyResident(request, "ASSIGNMENT_CANCELLED_BY_RESIDENT_RESIDENT");
    notifyVolunteer(request, assignment, "ASSIGNMENT_CANCELLED_BY_RESIDENT_VOLUNTEER", true);
    notifyResident(request, newStatus === "Open" ? "REQUEST_UPDATED_RESIDENT" : "REQUEST_EXPIRED_RESIDENT");
    send(res, 200, buildDetail(store, request, request.residentUid));
  });

  route("POST", "/api/requests/:id/assignment/collected", (req, res, { params, body = {} }) => {
    const ctx = context(req, res, params.id);
    if (!ctx) return;
    const { request, assignment, timestamp } = ctx;
    if (request.status !== "Assigned" || !assignment) return sendError(res, 409, "not_assigned", "This request is no longer assigned.");
    if (invalid(res, input(body, []))) return;
    assignment.collectedAt = timestamp;
    status(request, "Collected", timestamp);
    notifyResident(request, "REQUEST_COLLECTED_RESIDENT");
    notifyVolunteer(request, assignment, "REQUEST_COLLECTED_VOLUNTEER");
    send(res, 200, buildDetail(store, request, ctx.user.uid));
  });

  route("POST", "/api/requests/:id/assignment/missed", (req, res, { params, body = {} }) => {
    const ctx = context(req, res, params.id);
    if (!ctx) return;
    const { request, assignment, timestamp, time, user } = ctx;
    if (request.status !== "Assigned" || !assignment) return sendError(res, 409, "not_assigned", "This request is no longer assigned.");
    if (!ended(assignment, time)) return sendError(res, 409, "window_not_ended", "The pickup window hasn't ended yet.");
    const fields = input(body, ["reason", "reschedule"]);
    if (invalid(res, fields)) return;
    let replacement = null;
    if (body.reschedule !== undefined) {
      const reschedule = body.reschedule;
      const nested = input(reschedule, ["windows", "termsDocumentId"]);
      if (invalid(res, Object.fromEntries(Object.entries(nested).map(([key, value]) => [`reschedule.${key}`, value])))) return;
      const errors = windowErrors(request, reschedule.windows, time, time);
      if (typeof reschedule.termsDocumentId !== "string" || !reschedule.termsDocumentId.trim()) errors.termsDocumentId = "Accept the terms.";
      if (invalid(res, Object.fromEntries(Object.entries(errors).map(([key, value]) => [`reschedule.${key}`, value])))) return;
      if (reschedule.termsDocumentId !== store.terms.at(-1).termsDocumentId) return sendError(res, 409, "terms_outdated", "The terms have changed. Please read and accept them again.");
      if (!user.account?.address) return sendError(res, 403, "forbidden", "A resident profile is required.");
      const acceptanceId = randomUUID();
      replacement = {
        requestId: randomUUID(), residentUid: request.residentUid, categoryId: request.categoryId, quantity: request.quantity,
        estimatedWeightKg: weightFor(request),
        notes: request.notes ?? null, photo: request.photo ? { ...request.photo } : null,
        address: { ...user.account.address }, postalCode: user.account.address.postalCode,
        createdAt: timestamp, status: "Open", windows: reschedule.windows.map(({ date, startHour }) => ({ windowId: randomUUID(), date, startHour })),
        expiresAt: expires(reschedule.windows), termsDocumentId: reschedule.termsDocumentId, termsAcceptanceId: acceptanceId,
        statusHistory: [{ status: "Open", changedAt: timestamp, reason: null }], rescheduledFrom: { requestId: request.requestId },
      };
      store.termsAcceptances.push({ termsAcceptanceId: acceptanceId, accountId: user.uid, termsDocumentId: reschedule.termsDocumentId, type: "AT_RESIDENT_REQUEST_CREATION", acceptedAt: timestamp });
    }
    endAssignment(assignment, timestamp, "Missed_Pickup");
    status(request, "Missed", timestamp, body.reason ?? null);
    if (replacement) {
      request.rescheduledAs = { requestId: replacement.requestId };
      store.requests.push(replacement);
      notifyResident(replacement, "REQUEST_CREATED");
    }
    notifyResident(request, "ASSIGNMENT_MISSED_RESIDENT");
    notifyVolunteer(request, assignment, "ASSIGNMENT_MISSED_VOLUNTEER", true);
    send(res, 200, { request: buildDetail(store, request, user.uid), rescheduledRequest: replacement ? requestSummary(store, replacement) : null });
  });
}

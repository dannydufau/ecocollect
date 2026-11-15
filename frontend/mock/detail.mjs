import calgary from "../../backend/src/api/requests/calgary.js";
import { now } from "./store.mjs";

export const { windowStart } = calgary;
const HOUR = 60 * 60 * 1000;

export function requestSummary(store, request) {
  const category = store.categories.find((item) => item.categoryId === request.categoryId);
  return {
    requestId: request.requestId,
    category: { categoryId: category.categoryId, name: category.name, wasteType: category.wasteType },
    quantity: request.quantity,
    estimatedWeightKg: request.estimatedWeightKg,
    status: request.status,
    createdAt: request.createdAt,
    expiresAt: request.expiresAt,
  };
}

function photoUrl(photo, timestamp) {
  return photo ? `https://mock.imagekit.test/${encodeURIComponent(photo.fileId)}?expires=${timestamp + 10 * 60 * 1000}` : null;
}

/** @returns {import("../lib/types").RequestDetail | null} */
export function buildDetail(store, request, userId) {
  const account = store.accounts.find((person) => person.uid === userId);
  if (!request || !account || account.deactivatedAt) return null;
  const timestamp = now().getTime();
  const owner = request.residentUid === userId;
  const volunteer = account.roles.includes("volunteer");
  const assignments = store.assignments
    .filter((assignment) => assignment.requestId === request.requestId)
    .reverse()
    .sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt));
  const ownAssignment = assignments.find((assignment) => assignment.volunteerId === userId &&
    (!assignment.endedAt || assignment.endReason === "Delivered"));
  const openViewer = !owner && request.status === "Open" && volunteer;
  if (!owner && !openViewer && !ownAssignment) return null;

  const assignment = owner ? assignments.find((item) => !item.endedAt) ?? assignments[0] : ownAssignment;
  const windows = request.windows.filter((window) => window.isActive !== false);
  const actions = [];
  let refreshTimes = [];
  if (request.status === "Open") {
    refreshTimes = windows.map((window) => windowStart(window.date, window.startHour).getTime());
    if (Date.parse(request.expiresAt) > timestamp) {
      if (owner) actions.push("edit", "cancel");
      if (volunteer) actions.push("accept");
    }
  }
  if (request.status === "Assigned" && assignment && !assignment.endedAt) {
    const start = windowStart(assignment.window.date, assignment.window.startHour).getTime();
    const end = start + HOUR;
    const cancellationLimit = start - 24 * HOUR;
    refreshTimes = [cancellationLimit === timestamp ? timestamp + 1 : cancellationLimit, end];
    if (owner) {
      if (timestamp < end) actions.push("cancel", "cancel_assignment", "confirm_collected");
      else actions.push("confirm_collected", "report_missed");
    }
    if (ownAssignment && !ownAssignment.collectedAt) actions.push("cancel_assignment");
  }
  if (request.status === "Collected" && ownAssignment && !ownAssignment.endedAt) actions.push("record_delivery");

  const futureTimes = refreshTimes.filter((time) => time > timestamp);
  const detail = {
    ...requestSummary(store, request),
    postalCode: request.postalCode,
    windows: windows
      .filter((window) => !openViewer || windowStart(window.date, window.startHour).getTime() > timestamp)
      .map(({ windowId, date, startHour }) => ({ windowId, date, startHour })),
    photoUrl: photoUrl(request.photo, timestamp),
    viewer: owner ? "owner" : openViewer ? "volunteer" : "assigned_volunteer",
    allowedActions: [...new Set(actions)],
    refreshAt: futureTimes.length ? new Date(Math.min(...futureTimes)).toISOString() : null,
  };
  if (owner || !openViewer) {
    const resident = store.accounts.find((person) => person.uid === request.residentUid);
    detail.resident = { accountId: resident.uid, publicName: resident.displayName };
    detail.assignment = null;
    detail.delivery = request.delivery ? {
      facility: request.delivery.facility,
      deliveredAt: request.delivery.deliveredAt,
      evidencePhotoUrl: photoUrl(request.delivery.evidencePhoto, timestamp),
    } : null;
    if (assignment) {
      const person = store.accounts.find((user) => user.uid === assignment.volunteerId);
      detail.assignment = {
        assignmentId: assignment.assignmentId,
        volunteer: { accountId: person.uid, publicName: person.displayName },
        window: { windowId: assignment.window.windowId, date: assignment.window.date, startHour: assignment.window.startHour },
        status: assignment.endReason ?? (assignment.collectedAt ? "Collected" : "Active"),
        acceptedAt: assignment.acceptedAt,
        collectedAt: assignment.collectedAt ?? null,
        endedAt: assignment.endedAt ?? null,
        endReason: assignment.endReason ?? null,
        outsideCancellationWindow: Date.parse(assignment.endedAt ?? new Date(timestamp).toISOString()) >
          windowStart(assignment.window.date, assignment.window.startHour).getTime() - 24 * HOUR,
      };
    }
    if (owner || (assignment && !assignment.collectedAt && !assignment.endedAt)) {
      detail.address = { street: request.address.street, postalCode: request.postalCode };
      detail.notes = request.notes ?? null;
    }
  }
  if (owner) {
    detail.statusHistory = request.statusHistory;
    detail.rescheduledFrom = request.rescheduledFrom ?? null;
    detail.rescheduledAs = request.rescheduledAs ?? null;
  }
  return detail;
}

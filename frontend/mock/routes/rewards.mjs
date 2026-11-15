import { randomUUID } from "node:crypto";
import { currentUser, sendError } from "../store.mjs";
import { windowStart } from "../detail.mjs";

const HOUR = 60 * 60 * 1000;

function volunteerPoints(request) {
  const weightHundredths = Math.round(request.estimatedWeightKg * 100);
  return (300 * request.quantity + 4 * weightHundredths) / 100;
}

function addAward(store, assignment, accountId, earnedAs, points) {
  const existing = store.awards.find((award) => award.assignmentId === assignment.assignmentId && award.earnedAs === earnedAs);
  if (existing) return existing;
  const award = { awardId: randomUUID(), assignmentId: assignment.assignmentId, accountId, earnedAs, points,
    formula: earnedAs === "resident" ? "RESIDENT" : "VOLUNTEER" };
  store.awards.push(award);
  return award;
}

export function awardCancellation(store, assignment) {
  const request = store.requests.find((item) => item.requestId === assignment.requestId);
  if (request.residentUid === assignment.volunteerId || assignment.endReason !== "Resident_Cancelled" || !assignment.endedAt) return null;
  const start = windowStart(assignment.window.date, assignment.window.startHour).getTime();
  const ended = Date.parse(assignment.endedAt);
  if (ended <= start - 24 * HOUR || ended >= start + HOUR) return null;
  return addAward(store, assignment, assignment.volunteerId, "volunteer", volunteerPoints(request));
}

function awardDeliveries(store) {
  for (const assignment of store.assignments.filter((item) => item.endReason === "Delivered" && item.endedAt)) {
    const request = store.requests.find((item) => item.requestId === assignment.requestId);
    const points = volunteerPoints(request);
    addAward(store, assignment, assignment.volunteerId, "volunteer", points);
    addAward(store, assignment, request.residentUid, "resident", points / 2);
  }
}

function seedAwards(store) {
  awardDeliveries(store);
  const delivered = store.assignments.find((assignment) => assignment.endReason === "Delivered");
  if (!delivered) return;
  const original = store.requests.find((request) => request.requestId === delivered.requestId);
  const window = { ...delivered.window, windowId: randomUUID() };
  const endedAt = new Date(windowStart(window.date, window.startHour).getTime() - 2 * HOUR).toISOString();
  const request = { ...original, requestId: randomUUID(), status: "Cancelled", delivery: null, windows: [window],
    statusHistory: [
      { status: "Open", changedAt: original.createdAt, reason: null },
      { status: "Assigned", changedAt: delivered.acceptedAt, reason: null },
      { status: "Cancelled", changedAt: endedAt, reason: null },
    ] };
  const assignment = { ...delivered, assignmentId: randomUUID(), requestId: request.requestId, window,
    collectedAt: null, endedAt, endReason: "Resident_Cancelled" };
  store.requests.push(request);
  store.assignments.push(assignment);
  awardCancellation(store, assignment);
}

export function register(route, store) {
  if (!store.awards.length) seedAwards(store);
  route("GET", "/api/ecopoints", (req, res) => {
    const user = currentUser(req);
    if (!req.headers.authorization?.startsWith("Bearer ") || !user || user.account?.deactivatedAt) {
      return sendError(res, 401, "unauthorized", "Please log in again.");
    }
    awardDeliveries(store);
    let residentHundredths = 0;
    let volunteerHundredths = 0;
    const awards = store.awards.filter((award) => award.accountId === user.uid).map((award) => {
      if (award.earnedAs === "resident") residentHundredths += Math.round(award.points * 100);
      else volunteerHundredths += Math.round(award.points * 100);
      const assignment = store.assignments.find((item) => item.assignmentId === award.assignmentId);
      const request = store.requests.find((item) => item.requestId === assignment.requestId);
      const delivery = assignment.endReason === "Delivered";
      return {
        awardId: award.awardId, kind: delivery ? "DELIVERY" : "CANCELLATION", earnedAs: award.earnedAs,
        points: award.points, formula: award.formula, requestId: request.requestId, assignmentId: assignment.assignmentId,
        categoryName: delivery ? store.categories.find((category) => category.categoryId === request.categoryId).name : null,
        quantity: delivery ? request.quantity : null, estimatedWeightKg: delivery ? request.estimatedWeightKg : null,
        awardedAt: assignment.endedAt,
      };
    }).sort((a, b) => b.awardedAt.localeCompare(a.awardedAt));
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
      total: (residentHundredths + volunteerHundredths) / 100,
      asResident: residentHundredths / 100, asVolunteer: volunteerHundredths / 100, awards,
    }));
  });
}

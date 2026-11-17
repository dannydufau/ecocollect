// Titles and bodies for the notifications of a request, written like the examples in README 13.1
import { store } from "./store.mjs";

const hour = (value) => `${String(value % 24).padStart(2, "0")}:00`;

function windowText(window) {
  const day = new Date(`${window.date}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  return `${day}, ${hour(window.startHour)} to ${hour(window.startHour + 1)}`;
}

export function textFor(type, request) {
  const category = store.categories.find((item) => item.categoryId === request.categoryId)?.name ?? "items";
  const what = `${request.quantity} × ${category}`;
  const assignment = store.assignments.filter((item) => item.requestId === request.requestId).at(-1);
  const volunteer = store.accounts.find((account) => account.uid === assignment?.volunteerId)?.displayName ?? "A volunteer";
  const when = assignment ? windowText(assignment.window) : "the selected window";

  const texts = {
    REQUEST_CREATED: ["Request sent", what],
    REQUEST_UPDATED_RESIDENT: ["Request updated", `Your request for ${what} was updated.`],
    REQUEST_ASSIGNED_RESIDENT: ["Pickup accepted", `${volunteer} will come on ${when}.`],
    REQUEST_ASSIGNED_VOLUNTEER: ["Pickup accepted", `Collect ${what} on ${when}.`],
    REQUEST_COLLECTED_RESIDENT: ["Items collected", `${volunteer} collected ${what}.`],
    REQUEST_COLLECTED_VOLUNTEER: ["Pickup collected", `Take ${what} to a facility.`],
    REQUEST_DELIVERED_RESIDENT: ["Items delivered", `${what} reached a facility.`],
    REQUEST_DELIVERED_VOLUNTEER: ["Delivery recorded", `Your delivery of ${what} was recorded.`],
    ASSIGNMENT_CANCELLED_BY_RESIDENT_RESIDENT: ["Pickup cancelled", `You cancelled the pickup with ${volunteer}.`],
    ASSIGNMENT_CANCELLED_BY_RESIDENT_VOLUNTEER: ["Pickup cancelled", `Your pickup on ${when} was cancelled.`],
    ASSIGNMENT_CANCELLED_BY_VOLUNTEER_RESIDENT: ["Pickup cancelled", `${volunteer} cancelled the pickup.`],
    ASSIGNMENT_CANCELLED_BY_VOLUNTEER_VOLUNTEER: ["Pickup cancelled", `Your pickup on ${when} was cancelled.`],
    ASSIGNMENT_MISSED_RESIDENT: ["Pickup marked missed", `The pickup of ${what} was reported as missed.`],
    ASSIGNMENT_MISSED_VOLUNTEER: ["Pickup marked missed", `The resident reported that the pickup on ${when} did not happen.`],
    REQUEST_CANCELLED_RESIDENT: ["Request cancelled", `Your request for ${what} was cancelled.`],
    REQUEST_EXPIRED_RESIDENT: ["Request expired", `Your request for ${what} expired. You can create a new one.`],
  };
  const [title, body] = texts[type] ?? ["Pickup updated", "Your pickup request has changed."];
  return { title, body };
}

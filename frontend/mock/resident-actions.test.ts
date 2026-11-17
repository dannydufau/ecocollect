import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { seed, store } from "./store.mjs";
import { windowStart } from "./detail.mjs";
import { register } from "./routes/resident.mjs";

type Window = { windowId: string; date: string; startHour: number; isActive?: boolean };
type Request = { requestId: string; residentUid: string; status: string; categoryId: string; quantity: number; estimatedWeightKg: number; windows: Window[]; createdAt: string; expiresAt: string; photo?: { fileId: string } | null; notes?: string | null; statusHistory: { status: string }[] };
type Assignment = { assignmentId: string; requestId: string; volunteerId: string; window: Window; collectedAt: string | null; endedAt: string | null; endReason: string | null };
const data = store as unknown as { requests: Request[]; assignments: Assignment[]; awards: { points: number }[]; termsAcceptances: unknown[]; categories: { categoryId: string; standardWeightKg: number }[]; accounts: { uid: string; address: { street: string; postalCode: string } }[] };
type Handler = (req: IncomingMessage, res: ServerResponse, context: { body?: unknown; params: { id: string }; url: URL }) => void;
let routes: Map<string, Handler>;
const notify = vi.fn();
const HOUR = 3600000;
function call(method: string, request: Request, suffix = "", body?: unknown, user = "demo-resident-1") {
    const path = `/api/requests/${request.requestId}${suffix}`;
    const response = { status: 0, text: "", writeHead(status: number) { this.status = status; return this; }, end(text: string) { this.text = text; return this; } };
    routes.get(`${method} /api/requests/:id${suffix}`)!({ headers: user ? { authorization: `Bearer ${user}` } : {} } as IncomingMessage, response as unknown as ServerResponse, { body, params: { id: request.requestId }, url: new URL(path, "http://localhost") });
    return { status: response.status, body: JSON.parse(response.text) };
}
function assigned() {
    const request = data.requests.find(item => item.status === "Assigned")!;
    const assignment = data.assignments.find(item => item.requestId === request.requestId)!;
    const start = windowStart(assignment.window.date, assignment.window.startHour).getTime();
    return { request, assignment, start };
}
const windows = [{ date: "2026-11-25", startHour: 14 }];
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T18:00:00Z"));
    seed(); routes = new Map(); notify.mockClear();
    register((method: string, path: string, handler: Handler) => routes.set(`${method} ${path}`, handler), store, { notify });
});
afterEach(() => vi.useRealTimers());

it("edits only supplied fields, recalculates weight and removes a photo", () => {
    const request = data.requests.find(item => item.status === "Open")!;
    request.photo = { fileId: "shared" };
    const result = call("PATCH", request, "", { quantity: 3, photo: null });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ quantity: 3, estimatedWeightKg: 7.5, notes: "Side door", photoUrl: null });
    expect(request.categoryId).toBe("laptops");
});
it("keeps replaced windows inactive and checks the original creation deadline", () => {
    const request = data.requests.find(item => item.status === "Open")!;
    const old = request.windows[0];
    expect(call("PATCH", request, "", { windows }).status).toBe(200);
    expect(old.isActive).toBe(false);
    expect(request.expiresAt).toBe(windowStart("2026-11-25", 14).toISOString());
    const snapshot = JSON.stringify(request);
    expect(call("PATCH", request, "", { windows: [{ date: "2026-12-15", startHour: 14 }] }).status).toBe(400);
    expect(JSON.stringify(request)).toBe(snapshot);
});
it("rejects editing Assigned requests", () => {
    expect(call("PATCH", assigned().request, "", { quantity: 3 }).body.error.code).toBe("not_open");
});
it.each(["PATCH", "POST"])("expires an overdue Open request once on %s", method => {
    const request = data.requests.find(item => item.status === "Open")!;
    vi.setSystemTime(new Date(request.expiresAt));
    const suffix = method === "PATCH" ? "" : "/cancel";
    const result = call(method, request, suffix, {});
    expect(result.body.error.code).toBe("expired");
    expect(request.status).toBe("Expired");
    call(method, request, suffix, {});
    expect(request.statusHistory.filter(item => item.status === "Expired")).toHaveLength(1);
});
it.each([null, [], { quantity: 0 }, { notes: 5 }, { photo: { fileId: "" } }, { address: "wrong" }])("rejects invalid edits without mutation: %j", body => {
    const request = data.requests.find(item => item.status === "Open")!;
    const snapshot = JSON.stringify(request);
    expect(call("PATCH", request, "", body).status).toBe(400);
    expect(JSON.stringify(request)).toBe(snapshot);
});
it("cancels an Open request with a reason and refuses a second cancellation", () => {
    const request = data.requests.find(item => item.status === "Open")!;
    expect(call("POST", request, "/cancel", { reason: "Plans changed" }).body.status).toBe("Cancelled");
    expect(request.statusHistory.at(-1)).toMatchObject({ reason: "Plans changed" });
    expect(call("POST", request, "/cancel", {}).body.error.code).toBe("not_cancellable");
});
it.each(["/cancel", "/assignment/cancel"])("awards late resident cancellation once for %s", suffix => {
    const { request, assignment, start } = assigned();
    vi.setSystemTime(new Date(start - 2 * HOUR));
    expect(call("POST", request, suffix, suffix === "/cancel" ? { reason: "Changed plans" } : { as: "resident" }).status).toBe(200);
    expect(assignment.endReason).toBe("Resident_Cancelled");
    expect(data.awards).toHaveLength(1);
    expect(data.awards[0].points).toBe(26);
    call("POST", request, suffix, {});
    expect(data.awards).toHaveLength(1);
});
it.each([-72, -24])("awards no points %s hours from the selected start", hours => {
    const { request, start } = assigned();
    vi.setSystemTime(new Date(start + hours * HOUR));
    expect(call("POST", request, "/assignment/cancel", {}).status).toBe(200);
    expect(data.awards).toHaveLength(0);
});
it("awards nothing for self-cancellation and requires the role for a dual-role actor", () => {
    const { request, assignment, start } = assigned();
    request.residentUid = assignment.volunteerId = "demo-resident-5";
    vi.setSystemTime(new Date(start - HOUR));
    expect(call("POST", request, "/assignment/cancel", {}, "demo-resident-5").status).toBe(400);
    expect(call("POST", request, "/assignment/cancel", { as: "resident" }, "demo-resident-5").status).toBe(200);
    expect(data.awards).toHaveLength(0);
});
it.each(["/cancel", "/assignment/cancel"])("refuses %s at the exact selected window end", suffix => {
    const { request, assignment, start } = assigned();
    vi.setSystemTime(new Date(start + HOUR));
    expect(call("POST", request, suffix, {}).body.error.code).toBe("window_ended");
    expect(request.status).toBe("Assigned");
    expect(assignment.endedAt).toBeNull();
    expect(data.awards).toHaveLength(0);
});
it("expires after cancellation when the last slot has started, but reopens with new windows", () => {
    const { request, start } = assigned();
    vi.setSystemTime(new Date(start + HOUR / 2));
    expect(call("POST", request, "/assignment/cancel", {}).body.status).toBe("Expired");
});
it("reopens with replacement windows while preserving the selected historical slot", () => {
    const { request, assignment, start } = assigned();
    const selected = assignment.window;
    vi.setSystemTime(new Date(start + HOUR / 2));
    expect(call("POST", request, "/assignment/cancel", { as: "resident", windows }).body.status).toBe("Open");
    expect(assignment.window).toBe(selected);
    expect(selected.isActive).toBe(false);
    expect(request.windows.filter(window => window.isActive !== false)).toHaveLength(1);
});
it("confirms collection once and disallows later cancellation or missed reporting", () => {
    const { request, assignment } = assigned();
    expect(call("POST", request, "/assignment/collected").body.status).toBe("Collected");
    expect(assignment.collectedAt).toBeTruthy();
    expect(call("POST", request, "/assignment/collected").body.error.code).toBe("not_assigned");
    expect(call("POST", request, "/assignment/cancel", {}).body.error.code).toBe("already_collected");
    expect(call("POST", request, "/assignment/missed", {}).body.error.code).toBe("not_assigned");
});
it("refuses missed reporting before the end and allows it at the exact end without rescheduling", () => {
    const { request, assignment, start } = assigned();
    vi.setSystemTime(new Date(start + HOUR - 1));
    expect(call("POST", request, "/assignment/missed", {}).body.error.code).toBe("window_not_ended");
    vi.setSystemTime(new Date(start + HOUR));
    const result = call("POST", request, "/assignment/missed", { reason: "No one came" });
    expect(result.body).toMatchObject({ request: { status: "Missed" }, rescheduledRequest: null });
    expect(assignment.endReason).toBe("Missed_Pickup");
    expect(data.awards).toHaveLength(0);
});
it("reschedules once with current weight, address, terms, linked history and a shared photo", () => {
    const { request, start } = assigned();
    request.photo = { fileId: "shared-photo" };
    request.createdAt = "2026-10-01T12:00:00Z";
    data.categories.find(category => category.categoryId === "laptops")!.standardWeightKg = 3;
    vi.setSystemTime(new Date(start + HOUR));
    const count = data.requests.length;
    const body = { reschedule: { windows, termsDocumentId: "mock-terms-1" } };
    const result = call("POST", request, "/assignment/missed", body);
    expect(result.status).toBe(200);
    const replacement = data.requests.at(-1)!;
    expect(result.body.rescheduledRequest).toMatchObject({ requestId: replacement.requestId, estimatedWeightKg: 6, status: "Open" });
    expect(replacement).toMatchObject({ photo: { fileId: "shared-photo" }, notes: "Side door", rescheduledFrom: { requestId: request.requestId }, address: data.accounts[0].address });
    expect(result.body.request.rescheduledAs).toEqual({ requestId: replacement.requestId });
    expect(data.termsAcceptances).toHaveLength(1);
    expect(call("POST", request, "/assignment/missed", body).body.error.code).toBe("not_assigned");
    expect(data.requests).toHaveLength(count + 1);
});
it.each([{ windows: [], termsDocumentId: "mock-terms-1" }, { windows, termsDocumentId: "old" }, null])("keeps the assignment unchanged on invalid rescheduling: %j", reschedule => {
    const { request, assignment, start } = assigned();
    vi.setSystemTime(new Date(start + HOUR));
    expect(call("POST", request, "/assignment/missed", { reschedule }).status).toBeGreaterThanOrEqual(400);
    expect(request.status).toBe("Assigned");
    expect(assignment.endedAt).toBeNull();
    expect(data.termsAcceptances).toHaveLength(0);
});
it.each(["", "demo-resident-2", "demo-volunteer-1"])("blocks another actor or a missing login: %s", user => {
    const { request } = assigned();
    expect(call("POST", request, "/assignment/collected", {}, user).status).toBe(user === "" ? 401 : user === "demo-resident-2" ? 404 : 403);
    expect(request.status).toBe("Assigned");
});

it("sends the other party a notification without private request fields", () => {
    const { request } = assigned();
    expect(call("POST", request, "/assignment/collected").status).toBe(200);
    expect(notify).toHaveBeenCalledWith("demo-volunteer-1", expect.objectContaining({ type: "REQUEST_COLLECTED_VOLUNTEER", requestId: request.requestId }));
    for (const [, payload] of notify.mock.calls) {
        expect(payload).not.toHaveProperty("address");
        expect(payload).not.toHaveProperty("notes");
        expect(payload).not.toHaveProperty("photoUrl");
    }
});
it("sends both cancellation notifications when Q10 cancels an Assigned request", () => {
    const { request, assignment } = assigned();
    expect(call("POST", request, "/cancel", {}).status).toBe(200);
    const sent = notify.mock.calls.map(([account, payload]) => [account, payload.type]);
    expect(sent).toEqual([
        ["demo-resident-1", "ASSIGNMENT_CANCELLED_BY_RESIDENT_RESIDENT"],
        [assignment.volunteerId, "ASSIGNMENT_CANCELLED_BY_RESIDENT_VOLUNTEER"],
        ["demo-resident-1", "REQUEST_CANCELLED_RESIDENT"],
    ]);
});
it("hands a volunteer cancellation to volunteer.mjs without exposing the owner's detail", () => {
    const { request } = assigned();
    const result = call("POST", request, "/assignment/cancel", { as: "volunteer" }, "demo-volunteer-1");
    expect(result.status).toBe(200);
    expect(result.body).not.toHaveProperty("address");
    expect(request.status).toBe("Open");
});

it("serves the resident action through the HTTP router", async () => {
    const { startServer } = await import("./server.mjs");
    const server = await startServer({ port: 0 });
    try {
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("No mock server port");
        const request = data.requests.find(item => item.status === "Open")!;
        const url = `http://127.0.0.1:${address.port}/api/requests/${request.requestId}/cancel`;
        const options = { method: "POST", headers: { Authorization: "Bearer demo-resident-1", "Content-Type": "application/json" }, body: JSON.stringify({ reason: "Changed plans" }) };
        const response = await fetch(url, options);
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ status: "Cancelled", viewer: "owner" });
        const repeat = await fetch(url, options);
        expect(repeat.status).toBe(409);
        expect(await repeat.json()).toMatchObject({ error: { code: "not_cancellable" } });
    } finally {
        await new Promise<void>((resolve, reject) => server.close((error?: Error) => error ? reject(error) : resolve()));
    }
});

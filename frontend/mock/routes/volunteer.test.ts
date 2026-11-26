import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mockResponse } from "@/test/mock-response";
import { seed, store } from "../store.mjs";

type StoredWindow = { windowId: string; date: string; startHour: number };
type StoredRequest = {
    requestId: string; residentUid: string; categoryId: string; status: string; postalCode: string;
    windows: StoredWindow[]; expiresAt: string; createdAt: string; photo?: { fileId: string } | null;
};
type Handler = (req: IncomingMessage, res: ServerResponse, context: { params: Record<string, string>; url: URL; body?: unknown }) => void;
const mockStore = store as unknown as { requests: StoredRequest[]; terms: { termsDocumentId: string }[] };

let routes: { method: string; regex: RegExp; names: string[]; handler: Handler }[];
let notify: ReturnType<typeof vi.fn>;

// The same route order as server.mjs: files sorted by name, first match wins
async function loadRoutes() {
    routes = [];
    const files = fs.readdirSync(__dirname).filter((file) => file.endsWith(".mjs")).sort();
    for (const file of files) {
        const mod = await import(path.join(__dirname, file));
        mod.register((method: string, pattern: string, handler: Handler) => {
            const names: string[] = [];
            const source = pattern.replace(/:(\w+)/g, (_, name) => { names.push(name); return "([^/]+)"; });
            routes.push({ method, regex: new RegExp(`^${source}/?$`), names, handler });
        }, store, { notify });
    }
}

function call(method: string, target: string, user: string | null = "demo-volunteer-1", body?: unknown) {
    const url = new URL(target, "http://localhost");
    const response = mockResponse();
    for (const route of routes) {
        const match = route.regex.exec(url.pathname);
        if (route.method !== method || !match) continue;
        const params = Object.fromEntries(route.names.map((name, i) => [name, match[i + 1]]));
        const headers = user ? { authorization: `Bearer ${user}` } : {};
        route.handler({ headers } as IncomingMessage, response as unknown as ServerResponse, { params, url, body });
        break;
    }
    return { status: response.status, body: response.text ? JSON.parse(response.text) : null };
}

// Adds an Open request. Windows are [date, hour] in Calgary time.
function addOpen({ residentUid = "demo-resident-2", postalCode = "T3A0B1", windows = [["2026-11-23", 10]] as [string, number][], photo = null as { fileId: string } | null, expiresAt = "" } = {}) {
    const request: StoredRequest & Record<string, unknown> = {
        requestId: randomUUID(), residentUid, categoryId: "phones", quantity: 1, estimatedWeightKg: 0.2, status: "Open", postalCode,
        address: { street: "1 Main St", postalCode }, notes: null, photo,
        windows: windows.map(([date, startHour]) => ({ windowId: randomUUID(), date, startHour })),
        createdAt: "2026-11-19T18:00:00.000Z", expiresAt: expiresAt || "2026-11-23T17:00:00.000Z",
        statusHistory: [{ status: "Open", changedAt: "2026-11-19T18:00:00.000Z", reason: null }],
    };
    mockStore.requests.push(request);
    return request;
}

const seeded = (status: string) => mockStore.requests.find((request) => request.residentUid === "demo-resident-1" && request.status === status)!;
const terms = () => mockStore.terms.at(-1)!.termsDocumentId;
const accept = (request: StoredRequest, user = "demo-volunteer-2") =>
    call("POST", `/api/requests/${request.requestId}/assignment`, user, { windowId: request.windows[0].windowId, termsDocumentId: terms() });

beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T18:00:00Z"));
    seed();
    notify = vi.fn();
    await loadRoutes();
});
afterEach(() => vi.useRealTimers());

it("Q6 comes from the volunteer route", () => {
    addOpen({ photo: { fileId: "f1" } });
    const result = call("GET", "/api/requests?view=available");
    expect(result.status).toBe(200);
    expect(result.body[0]).toEqual({
        requestId: expect.any(String), category: { categoryId: "phones", name: "Phones", wasteType: "Mobile Devices" },
        quantity: 1, estimatedWeightKg: 0.2, postalCode: "T3A0B1",
        windows: [{ windowId: expect.any(String), date: "2026-11-23", startHour: 10 }], expiresAt: "2026-11-23T17:00:00.000Z", hasPhoto: true,
    });
});

it("Q6 filters by postal code", () => {
    const near = addOpen({ postalCode: "T3A0B1" });
    addOpen({ postalCode: "T2E5A8" });
    const result = call("GET", "/api/requests?view=available&postalCodes=T3A0B1");
    expect(result.body.map((row: { requestId: string }) => row.requestId)).toEqual([near.requestId]);
    expect(call("GET", "/api/requests?view=available").body.length).toBeGreaterThan(1);
});

it("Q6 gives 400 for more than 10 postal codes and for status filters", () => {
    const codes = Array.from({ length: 11 }, (_, i) => `T2P1J${i % 10}`).join(",");
    const result = call("GET", `/api/requests?view=available&postalCodes=${codes}`);
    expect(result.status).toBe(400);
    expect(result.body.error.details.fields).toHaveProperty("postalCodes");
    expect(call("GET", "/api/requests?view=available&status=Open").status).toBe(400);
});

it("Q6 keeps the caller's own requests", () => {
    const own = addOpen({ residentUid: "demo-resident-5", postalCode: "T3K2L7" });
    const ids = call("GET", "/api/requests?view=available", "demo-resident-5").body.map((row: { requestId: string }) => row.requestId);
    expect(ids).toContain(own.requestId);
});

it("Q6 drops past windows and expired requests", () => {
    const mixed = addOpen({ windows: [["2026-11-19", 10], ["2026-11-23", 10]] });
    const expired = addOpen({ windows: [["2026-11-19", 10]], expiresAt: "2026-11-19T17:00:00.000Z" });
    const rows = call("GET", "/api/requests?view=available").body;
    const row = rows.find((item: { requestId: string }) => item.requestId === mixed.requestId);
    expect(row.windows).toEqual([{ windowId: mixed.windows[1].windowId, date: "2026-11-23", startHour: 10 }]);
    expect(rows.some((item: { requestId: string }) => item.requestId === expired.requestId)).toBe(false);
});

it("Q6 needs a login and the volunteer role", () => {
    expect(call("GET", "/api/requests?view=available", null).status).toBe(401);
    expect(call("GET", "/api/requests?view=available", "demo-resident-1").status).toBe(403);
});

it("Q8 hides the address while Open and shows it after Q11", () => {
    const request = addOpen();
    const before = call("GET", `/api/requests/${request.requestId}`, "demo-volunteer-2");
    expect(before.status).toBe(200);
    expect(before.body.address).toBeUndefined();

    const accepted = accept(request);
    expect(accepted.status).toBe(201);
    expect(accepted.body.address).toEqual({ street: "1 Main St", postalCode: "T3A0B1" });
    expect(call("GET", `/api/requests/${request.requestId}`, "demo-volunteer-2").body.address).toEqual({ street: "1 Main St", postalCode: "T3A0B1" });
    expect(accept(request).body.error.code).toBe("already_assigned");
    expect(accept(request, "demo-volunteer-3").status).toBe(409);
});

it("Q11 gives not_open, expired, terms_outdated and 400 for a bad window", () => {
    expect(accept(seeded("Collected")).body.error.code).toBe("not_open");

    const overdue = addOpen({ windows: [["2026-11-19", 10]], expiresAt: "2026-11-19T17:00:00.000Z" });
    expect(accept(overdue).body.error.code).toBe("expired");
    expect(overdue.status).toBe("Expired");

    const request = addOpen();
    const outdated = call("POST", `/api/requests/${request.requestId}/assignment`, "demo-volunteer-2", { windowId: request.windows[0].windowId, termsDocumentId: "old" });
    expect(outdated.body.error.code).toBe("terms_outdated");
    const badWindow = call("POST", `/api/requests/${request.requestId}/assignment`, "demo-volunteer-2", { windowId: "nope", termsDocumentId: terms() });
    expect(badWindow.status).toBe(400);
    expect(badWindow.body.error.details.fields).toHaveProperty("windowId");
});

it("Q7 shows nulls for a cancelled row and filters by assignment status", () => {
    const request = addOpen();
    accept(request);
    call("POST", `/api/requests/${request.requestId}/assignment/cancel`, "demo-volunteer-2", {});
    const rows = call("GET", "/api/requests?view=volunteer&assignmentStatus=Volunteer_Cancelled", "demo-volunteer-2").body;
    expect(rows).toEqual([{
        requestId: request.requestId, category: null, quantity: null, estimatedWeightKg: null, postalCode: null, status: null,
        assignment: expect.objectContaining({ status: "Volunteer_Cancelled", endReason: "Volunteer_Cancelled" }),
    }]);

    const collected = call("GET", "/api/requests?view=volunteer&assignmentStatus=Collected").body;
    expect(collected).toHaveLength(1);
    expect(collected[0]).toMatchObject({ requestId: seeded("Collected").requestId, status: "Collected", category: { categoryId: "laptops" } });
    expect(call("GET", "/api/requests?view=volunteer&assignmentStatus=Done").status).toBe(400);
});

it("Q2 with categoryId returns only facilities that accept it", () => {
    const all = call("GET", "/api/facilities").body;
    const phones = call("GET", "/api/facilities?categoryId=phones").body;
    expect(all.length).toBeGreaterThan(phones.length);
    expect(phones.every((facility: { acceptedCategoryIds: string[] }) => facility.acceptedCategoryIds.includes("phones"))).toBe(true);
    expect(all.some((facility: { specialInstructions: string | null }) => facility.specialInstructions === null)).toBe(true);
    expect(call("GET", "/api/facilities", "demo-resident-1").status).toBe(403);
});

it("Q12 lets the volunteer cancel before collection and gives already_collected after", () => {
    const request = addOpen();
    accept(request);
    const cancelled = call("POST", `/api/requests/${request.requestId}/assignment/cancel`, "demo-volunteer-2", {});
    expect(cancelled.status).toBe(200);
    expect(request.status).toBe("Open");
    expect(cancelled.body).toMatchObject({ requestId: request.requestId, status: "Open", viewer: "volunteer" });

    const collected = call("POST", `/api/requests/${seeded("Collected").requestId}/assignment/cancel`, "demo-volunteer-1", {});
    expect(collected.body.error.code).toBe("already_collected");
});

it("Q15 checks the facility, the collection and a second delivery", () => {
    const collected = seeded("Collected");
    const deliver = (facilityId: string, id = collected.requestId) =>
        call("POST", `/api/requests/${id}/assignment/delivery`, "demo-volunteer-1", { facilityId, evidencePhoto: { fileId: "mock-1" } });

    expect(deliver("mock-facility-3").status).toBe(400);
    expect(deliver("mock-facility-1", seeded("Assigned").requestId).body.error.code).toBe("not_collected");
    const delivered = deliver("mock-facility-1");
    expect(delivered.status).toBe(200);
    expect(delivered.body.delivery).toMatchObject({ facility: { facilityId: "mock-facility-1", name: "Demo Recycling Facility" } });
    expect(deliver("mock-facility-1").body.error.code).toBe("already_delivered");
});

it("notifies the resident on Q11, Q12 and Q15", () => {
    const request = addOpen();
    const resident = () => notify.mock.calls.filter(([uid]) => uid === "demo-resident-2").map(([, data]) => data.type);
    accept(request);
    expect(resident()).toContain("REQUEST_ASSIGNED_RESIDENT");
    call("POST", `/api/requests/${request.requestId}/assignment/cancel`, "demo-volunteer-2", {});
    expect(resident()).toEqual(expect.arrayContaining(["ASSIGNMENT_CANCELLED_BY_VOLUNTEER_RESIDENT", "REQUEST_UPDATED_RESIDENT"]));

    call("POST", `/api/requests/${seeded("Collected").requestId}/assignment/delivery`, "demo-volunteer-1", { facilityId: "mock-facility-1", evidencePhoto: { fileId: "mock-1" } });
    expect(notify).toHaveBeenCalledWith("demo-resident-1", expect.objectContaining({ type: "REQUEST_DELIVERED_RESIDENT" }));
});

it("writes a title and body for the notifications, like the examples in README 13.1", () => {
    const request = addOpen();
    accept(request);
    const sent = (uid: string) => notify.mock.calls.filter(([to]) => to === uid).map(([, data]) => data);
    expect(sent("demo-resident-2")[0]).toMatchObject({ type: "REQUEST_ASSIGNED_RESIDENT", title: "Pickup accepted", body: "Victor V. will come on Mon, Nov 23, 10:00 to 11:00." });
    expect(sent("demo-volunteer-2")[0]).toMatchObject({ type: "REQUEST_ASSIGNED_VOLUNTEER", title: "Pickup accepted", body: "Collect 1 × Phones on Mon, Nov 23, 10:00 to 11:00." });
});

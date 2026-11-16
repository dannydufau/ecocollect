import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seed, store } from "../store.mjs";
import { buildDetail, windowStart } from "../detail.mjs";
import { register } from "./resident.mjs";
import type { PickupWindow, RequestStatus } from "@/lib/types";

type StoredRequest = {
    requestId: string; residentUid: string; status: RequestStatus; expiresAt: string;
    windows: PickupWindow[]; termsAcceptanceId?: string; photo?: { fileId: string };
};
type StoredAssignment = {
    requestId: string; volunteerId: string; window: PickupWindow;
    endedAt: string | null; endReason: string | null;
};
const mockStore = store as unknown as {
    requests: StoredRequest[];
    assignments: StoredAssignment[];
    accounts: { uid: string; address: { street: string; postalCode: string } }[];
};

type Context = { body?: unknown; url: URL; params: Record<string, string> };
type Handler = (req: IncomingMessage, res: ServerResponse, context: Context) => void;
let handlers: Map<string, Handler>;
const HOUR = 60 * 60 * 1000;

function call(method: string, path: string, user = "demo-resident-1", body?: unknown, key?: string) {
    const url = new URL(path, "http://localhost");
    const headers: Record<string, string> = {};
    if (user) headers.authorization = `Bearer ${user}`;
    if (key) headers["idempotency-key"] = key;
    const response = {
        status: 0, text: "",
        writeHead(status: number) { this.status = status; return this; },
        end(text: string) { this.text = text; return this; },
    };
    const detailRoute = /^\/api\/requests\/([^/]+)$/.exec(url.pathname);
    const route = detailRoute ? "/api/requests/:id" : url.pathname;
    handlers.get(`${method} ${route}`)!(
        { headers } as IncomingMessage, response as unknown as ServerResponse,
        { body, url, params: detailRoute ? { id: detailRoute[1] } : {} },
    );
    return { status: response.status, body: JSON.parse(response.text) };
}

function createBody() {
    return {
        items: [{ categoryId: "laptops", quantity: 2 }, { categoryId: "phones", quantity: 3 }],
        windows: [{ date: "2026-11-22", startHour: 14 }, { date: "2026-11-22", startHour: 16 }],
        termsDocumentId: "mock-terms-1", notes: "Side door",
    };
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T18:00:00Z"));
    seed();
    handlers = new Map();
    register((method: string, path: string, handler: Handler) => handlers.set(`${method} ${path}`, handler), store);
});

afterEach(() => vi.useRealTimers());

describe("resident mock routes", () => {
    it("returns the nine category names, weights and waste types", () => {
        const result = call("GET", "/api/categories");
        expect(result.status).toBe(200);
        expect(result.body).toHaveLength(9);
        expect(result.body).toContainEqual({ categoryId: "laptops", name: "Computers/Laptops", wasteType: "Electronics", standardWeightKg: 2.5 });
        expect(result.body.some((category: { categoryId: string }) => category.categoryId === "other-electronics")).toBe(false);
    });

    it("notifies the resident and the volunteers who prefer the postal code about each new request", () => {
        const notify = vi.fn();
        register((method: string, path: string, handler: Handler) => handlers.set(`${method} ${path}`, handler), store, { notify });
        const result = call("POST", "/api/requests", "demo-resident-1", createBody());
        const [laptops, phones] = result.body.requests;
        expect(notify).toHaveBeenCalledTimes(4);
        expect(notify).toHaveBeenCalledWith("demo-resident-1", expect.objectContaining({
            type: "REQUEST_CREATED", requestId: laptops.requestId, body: "2 × Computers/Laptops", url: `/resident/requests/${laptops.requestId}`,
        }));
        expect(notify).toHaveBeenCalledWith("demo-volunteer-1", expect.objectContaining({
            type: "NEW_MATCHING_REQUEST", requestId: phones.requestId, body: "3 × Phones in T2P1J9", url: `/volunteer/requests/${phones.requestId}`,
        }));
        expect(notify.mock.calls.map(([uid]) => uid)).not.toContain("demo-volunteer-2");
    });

    it("does not notify a deactivated volunteer about a new request", () => {
        const notify = vi.fn();
        register((method: string, path: string, handler: Handler) => handlers.set(`${method} ${path}`, handler), store, { notify });
        const volunteer = (store.accounts as { uid: string; deactivatedAt?: string }[]).find((account) => account.uid === "demo-volunteer-1")!;
        volunteer.deactivatedAt = "2026-11-19T10:00:00.000Z";
        call("POST", "/api/requests", "demo-resident-1", createBody());
        expect(notify.mock.calls.map(([uid]) => uid)).not.toContain("demo-volunteer-1");
    });

    it("creates one request per item and uses the last window start as expiry", () => {
        const result = call("POST", "/api/requests", "demo-resident-1", createBody());
        expect(result.status).toBe(201);
        expect(result.body.requests).toHaveLength(2);
        expect(result.body.requests.map((request: { estimatedWeightKg: number }) => request.estimatedWeightKg)).toEqual([5, 0.6]);
        expect(result.body.requests[0]).toEqual({
            requestId: expect.any(String), category: { categoryId: "laptops", name: "Computers/Laptops", wasteType: "Electronics" },
            quantity: 2, estimatedWeightKg: 5, status: "Open", createdAt: "2026-11-20T18:00:00.000Z",
            expiresAt: windowStart("2026-11-22", 16).toISOString(),
        });
        const request = mockStore.requests.find((item) => item.requestId === result.body.requests[0].requestId)!;
        expect(request.windows[0]).toEqual({ windowId: expect.any(String), date: "2026-11-22", startHour: 14 });
        expect(request.termsAcceptanceId).toBe(mockStore.requests.at(-1)!.termsAcceptanceId);
    });

    it("replays the same result for the same resident and idempotency key", () => {
        const count = mockStore.requests.length;
        const first = call("POST", "/api/requests", "demo-resident-1", createBody(), "one-submit");
        const second = call("POST", "/api/requests", "demo-resident-1", createBody(), "one-submit");
        expect(second).toEqual(first);
        expect(mockStore.requests).toHaveLength(count + 2);
        const otherResident = call("POST", "/api/requests", "demo-resident-2", createBody(), "one-submit");
        expect(otherResident.body.requests[0].requestId).not.toBe(first.body.requests[0].requestId);
    });

    it("copies the resident profile address and rejects a client-supplied address", () => {
        const resident = mockStore.accounts.find((account) => account.uid === "demo-resident-1")!;
        resident.address = { street: "456 5 Ave SW", postalCode: "T3A0B1" };
        const result = call("POST", "/api/requests", "demo-resident-1", createBody());
        const detail = call("GET", `/api/requests/${result.body.requests[0].requestId}`);
        expect(detail.body.address).toEqual(resident.address);
        expect(call("POST", "/api/requests", "demo-resident-1", { ...createBody(), address: resident.address }).status).toBe(400);
    });

    it("expires idempotency responses after 24 hours", () => {
        const first = call("POST", "/api/requests", "demo-resident-1", createBody(), "one-submit");
        vi.setSystemTime(new Date("2026-11-21T18:00:00Z"));
        const second = call("POST", "/api/requests", "demo-resident-1", createBody(), "one-submit");
        expect(second.body.requests[0].requestId).not.toBe(first.body.requests[0].requestId);
    });

    it.each([
        [{ date: "2026-12-21", startHour: 14 }, "within 30 days"],
        [{ date: "2026-02-30", startHour: 14 }, "valid date"],
        [{ date: "2026-11-19", startHour: 14 }, "future"],
        [{ date: "2026-11-22", startHour: 24 }, "0 to 23"],
    ])("rejects an invalid window %o with field errors", (window, message) => {
        const body = createBody();
        body.windows = [window];
        const result = call("POST", "/api/requests", "demo-resident-1", body);
        expect(result.status).toBe(400);
        expect(JSON.stringify(result.body.error.details.fields)).toContain(message);
        expect(mockStore.requests).toHaveLength(5);
    });

    it("rejects a window whose end exceeds the 30-day limit", () => {
        const body = createBody();
        const cutoff = new Date(Date.now() + 30 * 24 * HOUR);
        const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Edmonton", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
        }).formatToParts(cutoff).map((part) => [part.type, part.value]));
        body.windows = [{ date: `${parts.year}-${parts.month}-${parts.day}`, startHour: Number(parts.hour) }];
        expect(call("POST", "/api/requests", "demo-resident-1", body).status).toBe(400);
    });

    it("rejects duplicate slots and categories without creating partial requests", () => {
        const body = createBody();
        body.items[1].categoryId = "laptops";
        body.windows[1] = body.windows[0];
        const result = call("POST", "/api/requests", "demo-resident-1", body);
        expect(result.status).toBe(400);
        expect(result.body.error.details.fields).toHaveProperty("items[1].categoryId");
        expect(result.body.error.details.fields).toHaveProperty("windows[1]");
        expect(mockStore.requests).toHaveLength(5);
    });

    it("returns terms_outdated for an old terms document", () => {
        const body = { ...createBody(), termsDocumentId: "old-terms" };
        expect(call("POST", "/api/requests", "demo-resident-1", body)).toMatchObject({
            status: 409, body: { error: { code: "terms_outdated" } },
        });
        expect(mockStore.requests).toHaveLength(5);
    });

    it("rejects anonymous callers and non-resident creation", () => {
        expect(call("GET", "/api/categories", "").status).toBe(401);
        expect(call("POST", "/api/requests", "demo-volunteer-1", createBody()).status).toBe(403);
    });

    it("lists only the owner's requests with comma-separated status filters", () => {
        const result = call("GET", "/api/requests?view=mine&status=Assigned,Missed");
        expect(result.body.map((request: { status: string }) => request.status)).toEqual(["Assigned", "Missed"]);
        expect(call("GET", "/api/requests?view=mine", "demo-resident-2").body).toEqual([]);
        expect(call("GET", "/api/requests?view=mine&status=Unknown").status).toBe(400);
    });

    it("keeps private fields and photo URLs out of the list", () => {
        call("POST", "/api/requests", "demo-resident-1", { ...createBody(), items: [{ categoryId: "phones", quantity: 1, photo: { fileId: "photo-1" } }] });
        const result = call("GET", "/api/requests?view=mine");
        expect(result.body[0].hasPhoto).toBe(true);
        for (const request of result.body) {
            expect(request).not.toHaveProperty("address");
            expect(request).not.toHaveProperty("notes");
            expect(request).not.toHaveProperty("photoUrl");
        }
    });

    it("returns request_unavailable for hidden and missing requests", () => {
        const assigned = mockStore.requests.find((request) => request.status === "Assigned")!;
        for (const id of [assigned.requestId, "missing"]) {
            expect(call("GET", `/api/requests/${id}`, "demo-resident-2")).toMatchObject({
                status: 404, body: { error: { code: "request_unavailable" } },
            });
        }
    });
});

describe("buildDetail", () => {
    it("shows public Open details to volunteers and private details to the owner", () => {
        const request = mockStore.requests.find((item) => item.status === "Open")!;
        request.photo = { fileId: "item-photo" };
        const publicDetail = buildDetail(store, request, "demo-volunteer-2")!;
        expect(publicDetail.viewer).toBe("volunteer");
        expect(publicDetail.allowedActions).toEqual(["accept"]);
        expect(publicDetail.photoUrl).toContain("item-photo");
        for (const field of ["address", "notes", "resident", "assignment", "delivery", "statusHistory", "rescheduledFrom", "rescheduledAs"]) {
            expect(publicDetail).not.toHaveProperty(field);
        }
        const owner = buildDetail(store, request, "demo-resident-1")!;
        expect(owner.viewer).toBe("owner");
        expect(owner.allowedActions).toEqual(["edit", "cancel"]);
        expect(owner.address).toHaveProperty("street");
        expect(owner.statusHistory).toHaveLength(1);
    });

    it("changes owner actions at the exact end of the selected window", () => {
        const request = mockStore.requests.find((item) => item.status === "Assigned")!;
        const assignment = mockStore.assignments.find((item) => item.requestId === request.requestId)!;
        const start = windowStart(assignment.window.date, assignment.window.startHour).getTime();
        vi.setSystemTime(new Date(start - 25 * HOUR));
        expect(buildDetail(store, request, "demo-resident-1")).toMatchObject({
            allowedActions: ["cancel", "cancel_assignment", "confirm_collected"],
            refreshAt: new Date(start - 24 * HOUR).toISOString(),
        });
        vi.setSystemTime(new Date(start + HOUR - 1));
        expect(buildDetail(store, request, "demo-resident-1")!.allowedActions).toContain("cancel");
        vi.setSystemTime(new Date(start + HOUR));
        expect(buildDetail(store, request, "demo-resident-1")).toMatchObject({
            allowedActions: ["confirm_collected", "report_missed"], refreshAt: null,
        });
        expect(buildDetail(store, request, "demo-volunteer-1")!.allowedActions).toEqual(["cancel_assignment"]);
    });

    it("updates cancellation timing and refreshes at the window end", () => {
        const request = mockStore.requests.find((item) => item.status === "Assigned")!;
        const assignment = mockStore.assignments.find((item) => item.requestId === request.requestId)!;
        const start = windowStart(assignment.window.date, assignment.window.startHour).getTime();
        vi.setSystemTime(new Date(start - 24 * HOUR));
        expect(buildDetail(store, request, "demo-resident-1")!.assignment!.outsideCancellationWindow).toBe(false);
        vi.setSystemTime(new Date(start - 24 * HOUR + 1));
        expect(buildDetail(store, request, "demo-resident-1")).toMatchObject({
            assignment: { outsideCancellationWindow: true }, refreshAt: new Date(start + HOUR).toISOString(),
        });
    });

    it("hides address and notes after collection but keeps the delivery action", () => {
        const request = mockStore.requests.find((item) => item.status === "Collected")!;
        const detail = buildDetail(store, request, "demo-volunteer-1")!;
        expect(detail.viewer).toBe("assigned_volunteer");
        expect(detail.allowedActions).toEqual(["record_delivery"]);
        expect(detail).not.toHaveProperty("address");
        expect(detail).not.toHaveProperty("notes");
        expect(buildDetail(store, request, "demo-resident-1")).toHaveProperty("address");
    });

    it("keeps delivery evidence visible to the owner and delivering volunteer", () => {
        const request = mockStore.requests.find((item) => item.status === "Delivered")!;
        for (const user of ["demo-resident-1", "demo-volunteer-1"]) {
            expect(buildDetail(store, request, user)!.delivery!.evidencePhotoUrl).toContain("mock-delivery-evidence");
        }
        expect(buildDetail(store, request, "demo-volunteer-2")).toBeNull();
        expect(buildDetail(store, request, "demo-volunteer-1")).not.toHaveProperty("address");
    });

    it("hides missed requests from the former volunteer", () => {
        const request = mockStore.requests.find((item) => item.status === "Missed")!;
        expect(buildDetail(store, request, "demo-volunteer-1")).toBeNull();
        expect(buildDetail(store, request, "demo-resident-1")!.allowedActions).toEqual([]);
    });

    it.each(["Resident_Cancelled", "Volunteer_Cancelled", "Missed_Pickup"])(
        "hides requests after the volunteer's assignment ends as %s", (endReason) => {
            const request = mockStore.requests.find((item) => item.status === "Assigned")!;
            const assignment = mockStore.assignments.find((item) => item.requestId === request.requestId)!;
            assignment.endedAt = new Date().toISOString();
            assignment.endReason = endReason;
            request.status = endReason === "Missed_Pickup" ? "Missed" : "Cancelled";
            expect(call("GET", `/api/requests/${request.requestId}`, "demo-volunteer-1")).toMatchObject({
                status: 404, body: { error: { code: "request_unavailable" } },
            });
            expect(call("GET", `/api/requests/${request.requestId}`, "demo-resident-1").status).toBe(200);
        },
    );

    it("combines both sets of actions when the owner is also the volunteer", () => {
        const request = mockStore.requests.find((item) => item.status === "Assigned")!;
        const assignment = mockStore.assignments.find((item) => item.requestId === request.requestId)!;
        request.residentUid = "demo-resident-5";
        assignment.volunteerId = "demo-resident-5";
        vi.setSystemTime(new Date(windowStart(assignment.window.date, assignment.window.startHour).getTime() + HOUR));
        const detail = buildDetail(store, request, "demo-resident-5")!;
        expect(detail.viewer).toBe("owner");
        expect(detail.allowedActions).toEqual(["confirm_collected", "report_missed", "cancel_assignment"]);
    });

    it("gives overdue Open requests no actions and hides past windows from volunteers", () => {
        const request = mockStore.requests.find((item) => item.status === "Open")!;
        vi.setSystemTime(new Date(request.expiresAt));
        expect(buildDetail(store, request, "demo-volunteer-1")).toMatchObject({ allowedActions: [], windows: [], refreshAt: null });
        expect(buildDetail(store, request, "demo-resident-1")!.windows).toHaveLength(1);
    });
});

import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { seed, store } from "../store.mjs";
import { notify, register } from "./notifications.mjs";

type Context = { body?: unknown; url: URL; params: Record<string, string> };
type Handler = (req: IncomingMessage, res: ServerResponse, context: Context) => void;
type Stored = { notificationId: string; userId: string; type: string; createdAt: string; isRead: boolean };
const stored = () => store.notifications as unknown as Stored[];
let handlers: Map<string, Handler>;

function call(method: string, path: string, user: string | null = "demo-resident-1") {
    const url = new URL(path, "http://localhost");
    const headers: Record<string, string> = {};
    if (user) headers.authorization = `Bearer ${user}`;
    const response = {
        status: 0, text: "",
        writeHead(status: number) { this.status = status; return this; },
        end(text?: string) { this.text = text ?? ""; return this; },
    };
    const item = /^\/api\/notifications\/([^/]+)\/read$/.exec(url.pathname);
    const route = item ? "/api/notifications/:id/read" : url.pathname;
    handlers.get(`${method} ${route}`)!({ headers } as IncomingMessage, response as unknown as ServerResponse,
        { url, params: item ? { id: item[1] } : {} });
    return { status: response.status, body: response.text ? JSON.parse(response.text) : null };
}

// A fake stream: it records what was written to it and lets the test close it
function openStream(user: string | null = "demo-resident-1", cookie = false) {
    const headers: Record<string, string> = {};
    if (user) headers[cookie ? "cookie" : "authorization"] = cookie ? `session=${user}` : `Bearer ${user}`;
    const closers: (() => void)[] = [];
    const response = {
        status: 0, headers: {} as Record<string, string>, written: [] as string[], text: "",
        writeHead(status: number, head?: Record<string, string>) { this.status = status; this.headers = head ?? {}; return this; },
        write(text: string) { this.written.push(text); },
        end(text?: string) { this.text = text ?? ""; return this; },
        on(name: string, fn: () => void) { if (name === "close") closers.push(fn); },
    };
    const req = { headers };
    handlers.get("GET /api/events")!(req as unknown as IncomingMessage, response as unknown as ServerResponse, { url: new URL("http://localhost/api/events"), params: {} });
    return { response, close: () => closers.forEach((fn) => fn()) };
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-20T18:00:00Z"));
    seed();
    handlers = new Map();
    register((method: string, path: string, handler: Handler) => handlers.set(`${method} ${path}`, handler));
});
afterEach(() => vi.useRealTimers());

describe("GET /api/events", () => {
    it("sends ready first, then a ping every 25 seconds", () => {
        const { response } = openStream();
        expect(response.status).toBe(200);
        expect(response.headers["Content-Type"]).toBe("text/event-stream");
        expect(response.written).toEqual(["event: ready\ndata: {}\n\n"]);
        vi.advanceTimersByTime(24_999);
        expect(response.written).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(response.written[1]).toBe(": ping\n\n");
        vi.advanceTimersByTime(25_000);
        expect(response.written).toHaveLength(3);
    });

    it("accepts the session cookie and answers 401 without a login", () => {
        expect(openStream("demo-resident-1", true).response.status).toBe(200);
        const anonymous = openStream(null).response;
        expect(anonymous.status).toBe(401);
        expect(JSON.parse(anonymous.text).error.code).toBe("unauthorized");
    });

    it("keeps the connection under the user and stops pinging when it closes", () => {
        const { response, close } = openStream();
        expect(store.sseConnections.get("demo-resident-1")?.size).toBe(1);
        close();
        expect(store.sseConnections.get("demo-resident-1")?.size).toBe(0);
        vi.advanceTimersByTime(60_000);
        expect(response.written).toHaveLength(1);
    });
});

describe("notify", () => {
    it("stores the notification and writes a notification event to every stream of the user", () => {
        const first = openStream("demo-resident-1");
        const second = openStream("demo-resident-1");
        const other = openStream("demo-volunteer-1");
        const created = notify("demo-resident-1", { type: "REQUEST_CREATED", requestId: "r1", title: "Request sent", body: "2 × Phones", url: "/resident/requests/r1" })!;
        expect(stored()).toContainEqual(expect.objectContaining({ notificationId: created.notificationId, userId: "demo-resident-1", isRead: false }));
        for (const { response } of [first, second]) {
            const message = response.written.at(-1)!;
            expect(message.startsWith(`id: ${created.notificationId}\nevent: notification\ndata: `)).toBe(true);
            expect(JSON.parse(message.split("data: ")[1])).toEqual({
                notificationId: created.notificationId, type: "REQUEST_CREATED", requestId: "r1", awardId: null,
                title: "Request sent", body: "2 × Phones", url: "/resident/requests/r1", createdAt: "2026-11-20T18:00:00.000Z",
            });
        }
        expect(other.response.written).toHaveLength(1);
    });

    it("sends nothing to a deactivated account", () => {
        const { response } = openStream("demo-volunteer-5");
        (store.accounts as { uid: string; deactivatedAt?: string }[]).find((account) => account.uid === "demo-volunteer-5")!.deactivatedAt = "2026-11-19T10:00:00.000Z";
        expect(notify("demo-volunteer-5", { type: "NEW_MATCHING_REQUEST", title: "t", body: "b", url: "/" })).toBeNull();
        expect(stored().filter((item) => item.userId === "demo-volunteer-5")).toHaveLength(0);
        expect(response.written).toHaveLength(1);
    });

    it("works with nobody connected", () => {
        expect(() => notify("demo-resident-4", { type: "REQUEST_CREATED", title: "t", body: "b", url: "/" })).not.toThrow();
    });
});

describe("GET /api/notifications", () => {
    it("seeds six notifications of different types for the demo users", () => {
        const resident = call("GET", "/api/notifications");
        const volunteer = call("GET", "/api/notifications", "demo-volunteer-1");
        expect(resident.body.notifications).toHaveLength(3);
        expect(volunteer.body.notifications).toHaveLength(3);
        expect(new Set(stored().map((item) => item.type)).size).toBe(6);
        expect(resident.body.notifications[0]).toEqual(expect.objectContaining({
            notificationId: expect.any(String), type: expect.any(String), title: expect.any(String), isRead: expect.any(Boolean),
        }));
        expect(resident.body.notifications[0]).not.toHaveProperty("userId");
    });

    it("lists newest first with the unread count of all of the user's notifications", () => {
        const { body } = call("GET", "/api/notifications");
        const times = body.notifications.map((item: { createdAt: string }) => Date.parse(item.createdAt));
        expect(times).toEqual([...times].sort((a, b) => b - a));
        expect(body.unreadCount).toBe(2);
        expect(call("GET", "/api/notifications?limit=1").body.unreadCount).toBe(2);
    });

    it("pages with before and limit", () => {
        const all = call("GET", "/api/notifications").body.notifications;
        const first = call("GET", "/api/notifications?limit=2").body.notifications;
        expect(first.map((item: { notificationId: string }) => item.notificationId)).toEqual(all.slice(0, 2).map((item: { notificationId: string }) => item.notificationId));
        const next = call("GET", `/api/notifications?limit=2&before=${encodeURIComponent(first[1].createdAt)}`).body.notifications;
        expect(next.map((item: { notificationId: string }) => item.notificationId)).toEqual([all[2].notificationId]);
        expect(call("GET", `/api/notifications?before=${encodeURIComponent(all[2].createdAt)}`).body.notifications).toEqual([]);
    });

    it("returns only the signed-in user's notifications, including new ones", () => {
        notify("demo-resident-1", { type: "REQUEST_CREATED", title: "New", body: "b", url: "/" });
        expect(call("GET", "/api/notifications").body.notifications).toHaveLength(4);
        expect(call("GET", "/api/notifications", "demo-resident-2").body.notifications).toEqual([]);
    });

    it.each(["limit=0", "limit=101", "limit=abc", "limit=2.5", "before=yesterday"])("rejects %s", (query) => {
        const result = call("GET", `/api/notifications?${query}`);
        expect(result.status).toBe(400);
        expect(result.body.error.code).toBe("validation_error");
    });

    it("answers 401 without a login", () => {
        expect(call("GET", "/api/notifications", null).status).toBe(401);
    });
});

describe("PATCH /api/notifications/:id/read", () => {
    it("marks one read, lowers the unread count and tells the user's streams", () => {
        const stream = openStream("demo-resident-1");
        const unread = call("GET", "/api/notifications").body.notifications.find((item: { isRead: boolean }) => !item.isRead);
        const result = call("PATCH", `/api/notifications/${unread.notificationId}/read`);
        expect(result.status).toBe(204);
        const after = call("GET", "/api/notifications").body;
        expect(after.unreadCount).toBe(1);
        expect(after.notifications.find((item: { notificationId: string }) => item.notificationId === unread.notificationId).isRead).toBe(true);
        expect(stream.response.written.at(-1)).toBe(`event: notification-read\ndata: ${JSON.stringify({ notificationIds: [unread.notificationId] })}\n\n`);
    });

    it("answers 204 again for one that is already read", () => {
        const read = call("GET", "/api/notifications").body.notifications.find((item: { isRead: boolean }) => item.isRead);
        expect(call("PATCH", `/api/notifications/${read.notificationId}/read`).status).toBe(204);
        expect(call("GET", "/api/notifications").body.unreadCount).toBe(2);
    });

    it("answers 404 for an unknown id and for someone else's notification", () => {
        const mine = call("GET", "/api/notifications").body.notifications[0];
        expect(call("PATCH", "/api/notifications/nope/read").status).toBe(404);
        expect(call("PATCH", `/api/notifications/${mine.notificationId}/read`, "demo-resident-2").status).toBe(404);
        expect(call("GET", "/api/notifications").body.unreadCount).toBe(2);
    });

    it("answers 401 without a login", () => {
        expect(call("PATCH", "/api/notifications/x/read", null).status).toBe(401);
    });
});

describe("POST /api/notifications/read-all", () => {
    it("marks all of the user's notifications read and sends one message with all: true", () => {
        const stream = openStream("demo-volunteer-1");
        expect(call("POST", "/api/notifications/read-all", "demo-volunteer-1").status).toBe(204);
        expect(call("GET", "/api/notifications", "demo-volunteer-1").body.unreadCount).toBe(0);
        expect(stream.response.written.filter((text) => text.includes("notification-read"))).toEqual([`event: notification-read\ndata: {"all":true}\n\n`]);
        expect(call("GET", "/api/notifications").body.unreadCount).toBe(2);
    });

    it("answers 401 without a login", () => {
        expect(call("POST", "/api/notifications/read-all", null).status).toBe(401);
    });
});

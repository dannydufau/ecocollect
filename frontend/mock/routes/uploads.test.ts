import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, expect, it } from "vitest";
import { seed, store } from "../store.mjs";
import { register } from "./uploads.mjs";

type Handler = (req: IncomingMessage, res: ServerResponse, context: { body?: unknown }) => void;
let handlers: Map<string, Handler>;

function call(path: string, user: string | null, body?: unknown) {
    const response = {
        status: 0, text: "",
        writeHead(status: number) { this.status = status; return this; },
        end(text: string) { this.text = text; return this; },
    };
    const headers = user ? { authorization: `Bearer ${user}` } : {};
    handlers.get(path)!({ headers } as IncomingMessage, response as unknown as ServerResponse, { body });
    return { status: response.status, body: JSON.parse(response.text) };
}

const photo = { purpose: "item_photo", fileName: "a.jpg", contentType: "image/jpeg", sizeBytes: 1000 };

beforeEach(() => {
    seed();
    handlers = new Map();
    register((_method: string, path: string, handler: Handler) => handlers.set(path, handler), store);
});

it("rejects a GIF with a contentType field error", () => {
    const result = call("/api/uploads", "demo-resident-1", { ...photo, contentType: "image/gif" });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("validation_failed");
    expect(result.body.error.details.fields).toHaveProperty("contentType");
});

it("returns a full upload ticket for an item photo", () => {
    const result = call("/api/uploads", "demo-resident-1", photo);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
        uploadUrl: "/api/mock-imagekit/upload",
        token: expect.any(String),
        fields: {
            fileName: expect.stringMatching(/^[0-9a-f-]{36}\.jpg$/),
            folder: "mock/item-photos/demo-resident-1/",
            isPrivateFile: true,
            useUniqueFileName: false,
            overwriteFile: false,
            checks: expect.any(String),
            transformation: "{\"pre\":\"md-false\"}",
        },
        expiresAt: expect.stringMatching(/Z$/),
    });
});

it("rejects a file over 10 MB", () => {
    const result = call("/api/uploads", "demo-resident-1", { ...photo, sizeBytes: 10 * 1024 * 1024 + 1 });
    expect(result.status).toBe(400);
    expect(result.body.error.details.fields).toHaveProperty("sizeBytes");
});

it("returns 401 without a login", () => {
    expect(call("/api/uploads", null, photo).status).toBe(401);
});

it("returns 403 for evidence on a request this volunteer has not collected", () => {
    const mockStore = store as unknown as { requests: object[]; assignments: object[] };
    mockStore.requests.push({ requestId: "r1", status: "Assigned" });
    mockStore.assignments.push({ requestId: "r1", volunteerId: "demo-volunteer-1", endedAt: null });
    const result = call("/api/uploads", "demo-volunteer-1", { ...photo, purpose: "delivery_evidence", requestId: "r1" });
    expect(result.status).toBe(403);
});

it("fake upload returns a fileId", () => {
    const result = call("/api/mock-imagekit/upload", "demo-resident-1");
    expect(result.status).toBe(200);
    expect(result.body.fileId).toMatch(/^mock-/);
});

it("serves a placeholder image for the photoUrl of the mock detail", () => {
    const response = { status: 0, headers: {} as Record<string, string>, text: "",
        writeHead(status: number, headers: Record<string, string>) { this.status = status; this.headers = headers; return this; },
        end(text: string) { this.text = text; return this; } };
    handlers.get("/api/mock-imagekit/file/:fileId")!({ headers: {} } as IncomingMessage, response as unknown as ServerResponse, {});
    expect(response.status).toBe(200);
    expect(response.headers["Content-Type"]).toBe("image/svg+xml");
    expect(response.text).toContain("<svg");
});

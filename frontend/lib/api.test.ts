import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";

vi.mock("@/lib/firebase", () => ({
    auth: { authStateReady: () => Promise.resolve(), currentUser: null },
}));

function reply(status: number, body?: unknown, headers: Record<string, string> = {}) {
    const text = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(text || null, { status, headers })));
}

async function caught(call: Promise<unknown>) {
    try {
        await call;
    } catch (err) {
        return err as ApiError;
    }
    throw new Error("expected the call to fail");
}

beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

it("turns a 409 error body into an ApiError with the code and message", async () => {
    reply(409, { error: { code: "window_ended", message: "The window has ended." } });
    const err = await caught(api.post("/api/requests/1/cancel"));
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: "window_ended", message: "The window has ended." });
});

it("exposes the per-field messages of a 400", async () => {
    reply(400, { error: { code: "validation_error", message: "Check the fields.", details: { fields: { quantity: "must be a positive integer" } } } });
    const err = await caught(api.post("/api/requests", {}));
    expect(err.fields.quantity).toBe("must be a positive integer");
});

it("falls back to the code unknown when the body is not our error format", async () => {
    reply(502, "<html>Bad gateway</html>");
    const err = await caught(api.get("/api/anything"));
    expect(err).toMatchObject({ status: 502, code: "unknown", fields: {} });
});

it("returns undefined for a 204", async () => {
    reply(204);
    expect(await api.delete("/api/session")).toBeUndefined();
});

it("sends PATCH with a JSON body", async () => {
    reply(200, { ok: true });
    await api.patch("/api/requests/1", { quantity: 3 });
    expect(fetch).toHaveBeenCalledWith("/api/requests/1", expect.objectContaining({ method: "PATCH", body: '{"quantity":3}' }));
});

it("getWithMeta returns the Date header of the response as a Date", async () => {
    reply(200, { id: 1 }, { Date: "Sun, 15 Nov 2026 18:00:00 GMT" });
    const { data, serverDate } = await api.getWithMeta("/api/requests/1");
    expect(data).toEqual({ id: 1 });
    expect(serverDate).toEqual(new Date("2026-11-15T18:00:00Z"));
});

it("getWithMeta falls back to the device clock when there is no Date header", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
    reply(200, { id: 1 });
    const { serverDate } = await api.getWithMeta("/api/requests/1");
    expect(serverDate).toEqual(new Date("2026-11-15T12:00:00Z"));
    vi.useRealTimers();
});

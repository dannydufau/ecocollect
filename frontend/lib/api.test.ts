import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, ApiError, ApiTimeoutError, friendlyError, REQUEST_TIMEOUT_MS } from "./api";

const mocks = vi.hoisted(() => ({
    auth: { authStateReady: () => Promise.resolve(), currentUser: null as { getIdToken: () => Promise<string> } | null },
    signOut: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({ auth: mocks.auth }));
vi.mock("firebase/auth", () => ({ signOut: mocks.signOut }));

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

const assign = vi.fn();
beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.auth.currentUser = null;
    mocks.signOut.mockReset().mockResolvedValue(undefined);
    assign.mockClear();
    vi.stubGlobal("location", { pathname: "/resident", assign });
});
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

it("exposes the per-field messages of a 400 as sentences", async () => {
    reply(400, { error: { code: "validation_failed", message: "Some fields are invalid.", details: { fields: {
        "items[0].quantity": "must be at least 1", "address.street": "Enter a street." } } } });
    const err = await caught(api.post("/api/requests", {}));
    expect(err.fields).toEqual({ "items[0].quantity": "Please enter a whole number, 1 or more.", "address.street": "Enter a street." });
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

it.each([
    ["window_ended", "The pickup window has ended. Confirm the collection or report a missed pickup."],
    ["expired", "This request has expired."],
    ["already_assigned", "Another volunteer accepted this request first."],
    ["terms_outdated", "The terms have changed. Please read and accept them again."],
])("friendlyError gives a plain sentence for %s", (code, sentence) => {
    expect(friendlyError(new ApiError(409, { error: { code, message: "server text" } }))).toBe(sentence);
});

it("friendlyError uses the server message for a code it does not know", () => {
    expect(friendlyError(new ApiError(409, { error: { code: "something_new", message: "Try later." } }))).toBe("Try later.");
});

it.each(["toString", "constructor", "__proto__"])("friendlyError uses the server message for the inherited name %s", code => {
    expect(friendlyError(new ApiError(409, { error: { code, message: "Server says no." } }))).toBe("Server says no.");
});

it("friendlyError does not blame the user when the call never reached the server", () => {
    expect(friendlyError(new TypeError("Failed to fetch"))).toMatch(/could not reach the server/);
});

it("signs out, saves the current page for returnTo, and goes to the login page when a protected call gets a 401", async () => {
    vi.stubGlobal("location", { pathname: "/resident/requests/r1", search: "?tab=x", assign });
    mocks.auth.currentUser = { getIdToken: () => Promise.resolve("token") };
    reply(401, { error: { code: "unauthorized", message: "Please log in again." } });
    const err = await caught(api.get("/api/requests?view=mine"));
    expect(err.status).toBe(401);
    expect(sessionStorage.getItem("returnTo")).toBe("/resident/requests/r1?tab=x");
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledWith("/login?expired=1");
    sessionStorage.clear();
});

it("signs out only once when two protected calls get a 401 together", async () => {
    mocks.auth.currentUser = { getIdToken: () => Promise.resolve("token") };
    mocks.signOut.mockImplementation(() => new Promise(done => setTimeout(done, 10)));
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ error: { code: "unauthorized", message: "Please log in again." } }), { status: 401 }))));
    const results = await Promise.all([caught(api.get("/api/requests?view=mine")), caught(api.get("/api/ecopoints"))]);
    expect(results.map(err => err.status)).toEqual([401, 401]);
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledOnce();
});

it("leaves a 401 from the session call alone, because that is the login itself", async () => {
    mocks.auth.currentUser = { getIdToken: () => Promise.resolve("token") };
    reply(401, { error: { code: "unauthorized", message: "Wrong login." } });
    await caught(api.post("/api/session", { idToken: "x" }));
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
});

it("does not send a signed-out visitor to the login page for a 401", async () => {
    reply(401, { error: { code: "unauthorized", message: "Please log in." } });
    await caught(api.get("/api/public/stats"));
    expect(assign).not.toHaveBeenCalled();
});

it("does not redirect again when the visitor is already on the login page", async () => {
    vi.stubGlobal("location", { pathname: "/login", assign });
    mocks.auth.currentUser = { getIdToken: () => Promise.resolve("token") };
    reply(401, { error: { code: "unauthorized", message: "Please log in again." } });
    await caught(api.get("/api/requests?view=mine"));
    expect(assign).not.toHaveBeenCalled();
});

it("aborts a hung request after REQUEST_TIMEOUT_MS with ApiTimeoutError", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
    })));
    const pending = api.get("/api/requests?view=mine").catch(err => err);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    const err = await pending;
    expect(err).toBeInstanceOf(ApiTimeoutError);
    expect(friendlyError(err)).toBe("The request took too long. Check your connection and try again.");
    vi.useRealTimers();
});

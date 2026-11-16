import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { removePushSubscription } from "./auth";

const mocks = vi.hoisted(() => ({ delete: vi.fn() }));
vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("firebase/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { delete: mocks.delete, post: vi.fn() } }));

function useRegistration(registration: unknown) {
    vi.stubGlobal("navigator", { serviceWorker: { getRegistration: () => Promise.resolve(registration) } });
}
const withSubscription = (subscription: unknown) => ({ pushManager: { getSubscription: () => Promise.resolve(subscription) } });

beforeEach(() => {
    mocks.delete.mockReset().mockResolvedValue(undefined);
    vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("deletes the push subscription of this browser by its endpoint", async () => {
    useRegistration(withSubscription({ endpoint: "https://push.example/abc" }));
    await removePushSubscription();
    expect(mocks.delete).toHaveBeenCalledWith("/api/push/subscriptions", { endpoint: "https://push.example/abc" });
});

it("does nothing when there is no service worker or no subscription", async () => {
    useRegistration(undefined);
    await removePushSubscription();
    useRegistration(withSubscription(null));
    await removePushSubscription();
    vi.stubGlobal("navigator", {});
    await removePushSubscription();
    expect(mocks.delete).not.toHaveBeenCalled();
});

it("only warns when the server call fails", async () => {
    useRegistration(withSubscription({ endpoint: "https://push.example/abc" }));
    mocks.delete.mockRejectedValue(new Error("offline"));
    await expect(removePushSubscription()).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
});

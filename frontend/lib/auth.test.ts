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

it("deletes the push subscription on the server and unsubscribes in the browser", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    useRegistration(withSubscription({ endpoint: "https://push.example/abc", unsubscribe }));
    await removePushSubscription();
    expect(mocks.delete).toHaveBeenCalledWith("/api/push/subscriptions", { endpoint: "https://push.example/abc" });
    expect(unsubscribe).toHaveBeenCalledOnce();
});

it("still unsubscribes the browser when skipServer is true (deactivation or expiry)", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    useRegistration(withSubscription({ endpoint: "https://push.example/abc", unsubscribe }));
    await removePushSubscription({ skipServer: true });
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledOnce();
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

it("still unsubscribes the browser and only warns when the server call fails", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    useRegistration(withSubscription({ endpoint: "https://push.example/abc", unsubscribe }));
    mocks.delete.mockRejectedValue(new Error("offline"));
    await expect(removePushSubscription()).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledOnce();
});

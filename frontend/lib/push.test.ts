import { afterEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { subscribe, unsubscribe } from "./push";

vi.mock("@/lib/api", () => ({ api: { post: vi.fn(), delete: vi.fn() } }));

function useSubscription(subscription: unknown) {
    const registration = { pushManager: { getSubscription: async () => subscription } };
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration: async () => registration } });
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.delete).mockReset();
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
});

it("unsubscribes in the browser and deletes the subscription by its endpoint", async () => {
    const subscription = { endpoint: "https://push.example.test/abc", unsubscribe: vi.fn(async () => true) };
    useSubscription(subscription);
    await unsubscribe();
    expect(subscription.unsubscribe).toHaveBeenCalled();
    expect(api.delete).toHaveBeenCalledWith("/api/push/subscriptions", { endpoint: "https://push.example.test/abc" });
});

it("does nothing without a subscription", async () => {
    useSubscription(null);
    await unsubscribe();
    expect(api.delete).not.toHaveBeenCalled();
});

// jsdom has no Notification or service worker. The calls are written to `order` to check the sequence.
function fakeBrowser(answer: string, order: string[]) {
    const subscription = { toJSON: () => ({ endpoint: "https://push.example.test/abc", keys: { p256dh: "p", auth: "a" }, expirationTime: null }) };
    const registration = { pushManager: { subscribe: vi.fn(async () => subscription) } };
    vi.stubGlobal("Notification", { requestPermission: vi.fn(async () => { order.push("permission"); return answer; }) });
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: {
        register: vi.fn(async () => { order.push("register"); }),
        ready: Promise.resolve(registration),
    } });
    return registration;
}

it("asks for permission first, so the click is still fresh, then registers and subscribes", async () => {
    const order: string[] = [];
    const registration = fakeBrowser("granted", order);
    expect(await subscribe("AQID")).toBe("granted");
    expect(order).toEqual(["permission", "register"]);
    expect(registration.pushManager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: new Uint8Array([1, 2, 3]) });
    expect(api.post).toHaveBeenCalledWith("/api/push/subscriptions", { endpoint: "https://push.example.test/abc", keys: { p256dh: "p", auth: "a" }, expirationTime: null });
});

it("registers nothing and posts nothing when the permission is not granted", async () => {
    const order: string[] = [];
    fakeBrowser("denied", order);
    expect(await subscribe("AQID")).toBe("denied");
    expect(order).toEqual(["permission"]);
    expect(api.post).not.toHaveBeenCalled();
});

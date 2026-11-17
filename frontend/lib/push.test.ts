import { afterEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { unsubscribe } from "./push";

vi.mock("@/lib/api", () => ({ api: { post: vi.fn(), delete: vi.fn() } }));

function useSubscription(subscription: unknown) {
    const registration = { pushManager: { getSubscription: async () => subscription } };
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { getRegistration: async () => registration } });
}

afterEach(() => {
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

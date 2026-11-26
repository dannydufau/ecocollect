// Audit repro for PUSH-01. Both tests PASS while the bug exists: they assert the current behaviour.
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { removePushSubscription } from "@/lib/auth";
import EnableNotifications from "./enable-notifications";

vi.mock("@/lib/api", () => ({ api: { post: vi.fn(), delete: vi.fn() } }));
vi.mock("@/lib/firebase", () => ({ auth: { currentUser: null } }));

// A browser that remembers its push subscription, as real ones do until unsubscribe() is called
function browser() {
    let current: unknown = null;
    const unsubscribe = vi.fn(async () => { current = null; return true; });
    const sub = { endpoint: "https://push.example.test/abc", unsubscribe, toJSON: () => ({ endpoint: "https://push.example.test/abc", keys: { p256dh: "p", auth: "a" }, expirationTime: null }) };
    vi.stubGlobal("Notification", { permission: "granted", requestPermission: vi.fn(async () => "granted") });
    vi.stubGlobal("PushManager", class {});
    const registration = { pushManager: { getSubscription: vi.fn(async () => current), subscribe: vi.fn(async () => (current = sub)) } };
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register: vi.fn(async () => registration), ready: Promise.resolve(registration), getRegistration: vi.fn(async () => registration) } });
    return { unsubscribe };
}
beforeEach(() => { vi.mocked(api.post).mockReset().mockResolvedValue(undefined); vi.mocked(api.delete).mockReset().mockResolvedValue(undefined); vi.stubEnv("NEXT_PUBLIC_VAPID_KEY", "AQID"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const turnOn = () => screen.findByRole("button", { name: "Turn on device notifications" });

it("REPRO A: after sign-out the next sign-in shows On, but the server has no subscription", async () => {
    const fake = browser();
    render(<EnableNotifications />);
    await userEvent.click(await turnOn());
    await screen.findByText("On");
    cleanup();
    await removePushSubscription();
    expect(api.delete).toHaveBeenCalledWith("/api/push/subscriptions", { endpoint: "https://push.example.test/abc" });
    expect(fake.unsubscribe).not.toHaveBeenCalled();
    vi.mocked(api.post).mockClear();
    render(<EnableNotifications />);
    expect(await screen.findByText("On")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Turn on device notifications" })).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
});

it("REPRO B: the server rejects the subscription, and a revisit still says On", async () => {
    browser();
    vi.mocked(api.post).mockRejectedValue(new Error("server down"));
    render(<EnableNotifications />);
    await userEvent.click(await turnOn());
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not turn on notifications");
    cleanup();
    render(<EnableNotifications />);
    expect(await screen.findByText("On")).toBeInTheDocument();
});

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import EnableNotifications from "./enable-notifications";

vi.mock("@/lib/api", () => ({ api: { post: vi.fn(), delete: vi.fn() } }));

const json = { endpoint: "https://push.example.test/abc", keys: { p256dh: "p", auth: "a" }, expirationTime: null };

// jsdom has no Notification, PushManager or service worker, so each test gets fakes
function fakeBrowser({ permission = "default", answer = "granted", existing = null as unknown, subscribe = vi.fn() } = {}) {
    const requestPermission = vi.fn(async () => answer);
    vi.stubGlobal("Notification", { permission, requestPermission });
    vi.stubGlobal("PushManager", class {});
    subscribe.mockResolvedValue({ toJSON: () => json });
    const registration = { pushManager: { getSubscription: vi.fn(async () => existing), subscribe } };
    const register = vi.fn(async () => registration);
    Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: { register, ready: Promise.resolve(registration), getRegistration: vi.fn(async () => registration) },
    });
    return { requestPermission, subscribe, register };
}

beforeEach(() => {
    vi.mocked(api.post).mockReset().mockResolvedValue(undefined);
    vi.stubEnv("NEXT_PUBLIC_VAPID_KEY", "AQID");
});

// Vitest does not clean the page between tests by itself
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks(); // the iPhone user agent
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
    delete (navigator as { standalone?: boolean }).standalone;
});

it("asks for permission, subscribes and posts the subscription", async () => {
    const { requestPermission, subscribe, register } = fakeBrowser();
    render(<EnableNotifications />);

    await userEvent.click(await screen.findByRole("button", { name: "Turn on device notifications" }));
    expect(register).toHaveBeenCalledWith("/sw.js");
    expect(requestPermission).toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: new Uint8Array([1, 2, 3]) });
    expect(api.post).toHaveBeenCalledWith("/api/push/subscriptions", json);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("You will get notifications on this device.")).toBeInTheDocument();
});

it("shows the hint and posts nothing when permission is denied on click", async () => {
    const { subscribe } = fakeBrowser({ answer: "denied" });
    render(<EnableNotifications />);

    await userEvent.click(await screen.findByRole("button", { name: "Turn on device notifications" }));
    expect(screen.getByText("Notifications are blocked for this site. You can turn them on in your browser settings.")).toBeInTheDocument();
    expect(subscribe).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
});

it("shows the hint without a button when permission was already denied", async () => {
    fakeBrowser({ permission: "denied" });
    render(<EnableNotifications />);

    expect(await screen.findByText("Notifications are blocked for this site. You can turn them on in your browser settings.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("says On, with no button, when already subscribed", async () => {
    const { requestPermission } = fakeBrowser({ permission: "granted", existing: { endpoint: json.endpoint } });
    render(<EnableNotifications />);

    expect(await screen.findByText("On")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("You will get notifications on this device.");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(requestPermission).not.toHaveBeenCalled();
});

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

it("tells iPhone users in a Safari tab to add EcoCollect to the Home Screen", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(IPHONE);
    render(<EnableNotifications />);
    expect(await screen.findByText(/Tap the Share button, then Add to Home Screen/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("offers Turn on in the iPhone app opened from the Home Screen", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(IPHONE);
    Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
    fakeBrowser();
    render(<EnableNotifications />);
    expect(await screen.findByRole("button", { name: /Turn on device notifications/ })).toBeInTheDocument();
});

it("says so in a browser without push", async () => {
    render(<EnableNotifications />);
    expect(await screen.findByText("This browser does not support device notifications.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("says Blocked when permission was denied", async () => {
    fakeBrowser({ permission: "denied" });
    render(<EnableNotifications />);
    expect(await screen.findByText("Blocked")).toBeInTheDocument();
});

it("offers Turn on with a hidden bell icon", async () => {
    fakeBrowser();
    render(<EnableNotifications />);
    const button = await screen.findByRole("button", { name: "Turn on device notifications" });
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
});

it("says notifications are not set up when the VAPID key is empty", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_KEY", "");
    const { requestPermission } = fakeBrowser();
    render(<EnableNotifications />);

    expect(await screen.findByText("Notifications are not set up yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(requestPermission).not.toHaveBeenCalled();
});

it("shows an error when subscribing fails", async () => {
    const subscribe = vi.fn();
    fakeBrowser({ subscribe });
    subscribe.mockReset().mockRejectedValue(new Error("no push service"));
    render(<EnableNotifications />);

    await userEvent.click(await screen.findByRole("button", { name: "Turn on device notifications" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not turn on notifications. Please try again.");
    expect(api.post).not.toHaveBeenCalled();
});

it("offers Turn on again on revisit when saving the subscription to the server failed", async () => {
    let current: unknown = null;
    const unsubscribe = vi.fn(async () => { current = null; return true; });
    const sub = { endpoint: json.endpoint, unsubscribe, toJSON: () => json };
    vi.stubGlobal("Notification", { permission: "granted", requestPermission: vi.fn(async () => "granted") });
    vi.stubGlobal("PushManager", class {});
    const registration = { pushManager: { getSubscription: vi.fn(async () => current), subscribe: vi.fn(async () => (current = sub)) } };
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register: vi.fn(async () => registration), ready: Promise.resolve(registration), getRegistration: vi.fn(async () => registration) } });

    vi.mocked(api.post).mockRejectedValue(new Error("offline"));
    render(<EnableNotifications />);
    await userEvent.click(await screen.findByRole("button", { name: "Turn on device notifications" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not turn on notifications. Please try again.");
    expect(unsubscribe).toHaveBeenCalledOnce();

    cleanup();
    render(<EnableNotifications />);
    expect(await screen.findByRole("button", { name: "Turn on device notifications" })).toBeInTheDocument();
    expect(screen.queryByText("On")).not.toBeInTheDocument();
});

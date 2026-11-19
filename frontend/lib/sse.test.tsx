import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { useEventStream } from "./sse";

vi.mock("@/lib/auth-context", () => ({ useAuth: vi.fn() }));

// A fake EventSource that remembers how it was opened and lets the test send events
class FakeSource {
    static all: FakeSource[] = [];
    listeners = new Map<string, (event: { data: string }) => void>();
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    static CLOSED = 2;
    readyState = 0;
    close = vi.fn();
    constructor(public url: string, public init?: EventSourceInit) { FakeSource.all.push(this); }
    addEventListener(name: string, listener: (event: { data: string }) => void) { this.listeners.set(name, listener); }
    emit(name: string, data: unknown) { this.listeners.get(name)?.({ data: typeof data === "string" ? data : JSON.stringify(data) }); }
}

let client: QueryClient;
let signOut: ReturnType<typeof vi.fn>;
let refreshRoles: ReturnType<typeof vi.fn>;
let getNotifications: ReturnType<typeof vi.fn>;
let shown: { tag: string; close: ReturnType<typeof vi.fn> }[];

function signedIn(roles = ["resident"]) {
    vi.mocked(useAuth).mockReturnValue({ user: { uid: "u1" }, roles, signOut, refreshRoles } as unknown as ReturnType<typeof useAuth>);
}
function signedOut() {
    vi.mocked(useAuth).mockReturnValue({ user: null, roles: [], signOut, refreshRoles } as unknown as ReturnType<typeof useAuth>);
}
function mount() {
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    return renderHook(() => useEventStream(), { wrapper });
}
function invalidated() {
    return vi.mocked(client.invalidateQueries).mock.calls.map(([filters]) => filters?.queryKey);
}

beforeEach(() => {
    FakeSource.all = [];
    vi.stubGlobal("EventSource", FakeSource);
    client = new QueryClient();
    vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    signOut = vi.fn().mockResolvedValue(undefined);
    refreshRoles = vi.fn().mockResolvedValue([]);
    shown = [
        { tag: "request-r1", close: vi.fn() },
        { tag: "award-a1", close: vi.fn() },
        { tag: "request-r2", close: vi.fn() },
    ];
    getNotifications = vi.fn(async (options?: { tag?: string }) => shown.filter((item) => !options?.tag || item.tag === options.tag));
    vi.stubGlobal("navigator", { serviceWorker: { ready: Promise.resolve({ getNotifications }) } });
    signedIn();
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

it("opens one stream with the cookie when signed in", () => {
    mount();
    expect(FakeSource.all).toHaveLength(1);
    expect(FakeSource.all[0].url).toBe("/api/events");
    expect(FakeSource.all[0].init).toEqual({ withCredentials: true });
});

it("opens no stream when signed out or without a role", () => {
    signedOut();
    mount();
    vi.mocked(useAuth).mockReturnValue({ user: { uid: "u1" }, roles: [], signOut, refreshRoles } as unknown as ReturnType<typeof useAuth>);
    mount();
    expect(FakeSource.all).toHaveLength(0);
});

it("does nothing when the browser has no EventSource", () => {
    vi.stubGlobal("EventSource", undefined);
    expect(() => mount()).not.toThrow();
});

it("closes the stream on sign-out and on unmount", () => {
    const view = mount();
    signedOut();
    view.rerender();
    expect(FakeSource.all[0].close).toHaveBeenCalledTimes(1);
    expect(FakeSource.all).toHaveLength(1);

    signedIn();
    const other = mount();
    other.unmount();
    expect(FakeSource.all[1].close).toHaveBeenCalledTimes(1);
});

it("a notification invalidates the keys for its type", () => {
    mount();
    act(() => FakeSource.all[0].emit("notification", { notificationId: "n1", type: "REQUEST_ASSIGNED_RESIDENT", requestId: "r1" }));
    expect(invalidated()).toEqual([["notifications"], ["requests", "mine"], ["request", "r1"]]);
});

it("notification-expired invalidates notifications and closes the device notifications with its tag", async () => {
    mount();
    act(() => FakeSource.all[0].emit("notification-expired", { notificationIds: ["n1"], requestId: "r1", tag: "request-r1" }));
    expect(invalidated()).toEqual([["notifications"]]);
    await vi.waitFor(() => expect(shown[0].close).toHaveBeenCalled());
    expect(getNotifications).toHaveBeenCalledWith({ tag: "request-r1" });
    expect(shown[1].close).not.toHaveBeenCalled();
});

it("notification-read closes the device notifications of those ids", async () => {
    client.setQueryData(["notifications"], {
        unreadCount: 1,
        notifications: [
            { notificationId: "n1", requestId: null, awardId: "a1" },
            { notificationId: "n2", requestId: "r2", awardId: null },
        ],
    });
    mount();
    act(() => FakeSource.all[0].emit("notification-read", { notificationIds: ["n1"] }));
    expect(invalidated()).toEqual([["notifications"]]);
    await vi.waitFor(() => expect(shown[1].close).toHaveBeenCalled());
    expect(getNotifications).toHaveBeenCalledWith({ tag: "award-a1" });
    expect(shown[0].close).not.toHaveBeenCalled();
    expect(shown[2].close).not.toHaveBeenCalled();
});

it("notification-read with all closes every device notification", async () => {
    mount();
    act(() => FakeSource.all[0].emit("notification-read", { all: true }));
    expect(invalidated()).toEqual([["notifications"]]);
    await vi.waitFor(() => shown.forEach((item) => expect(item.close).toHaveBeenCalled()));
});

it("does not throw when there is no service worker", () => {
    vi.stubGlobal("navigator", {});
    mount();
    expect(() => act(() => FakeSource.all[0].emit("notification-read", { all: true }))).not.toThrow();
});

it("available-requests-changed invalidates the list and the request", () => {
    mount();
    act(() => FakeSource.all[0].emit("available-requests-changed", { requestId: "r9" }));
    expect(invalidated()).toEqual([["requests", "available"], ["request", "r9"]]);
});

it("profile-updated invalidates the profile and refreshes roles only when they changed", () => {
    mount();
    act(() => FakeSource.all[0].emit("profile-updated", { changed: ["publicName"] }));
    expect(invalidated()).toEqual([["profile"]]);
    expect(refreshRoles).not.toHaveBeenCalled();
    act(() => FakeSource.all[0].emit("profile-updated", { changed: ["roles"] }));
    expect(refreshRoles).toHaveBeenCalledTimes(1);
});

it("onopen invalidates everything", () => {
    mount();
    act(() => FakeSource.all[0].onopen?.());
    expect(client.invalidateQueries).toHaveBeenCalledWith();
});

it("account-deactivated signs out", () => {
    mount();
    act(() => FakeSource.all[0].emit("account-deactivated", {}));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalledWith({ skipServer: true });
});

it("refetches notifications every 30 s while the stream is down and stops on reopen", () => {
    vi.useFakeTimers();
    mount();
    const source = FakeSource.all[0];
    act(() => source.onerror?.());
    act(() => source.onerror?.());
    vi.advanceTimersByTime(29_999);
    expect(invalidated()).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(invalidated()).toEqual([["notifications"]]);
    vi.advanceTimersByTime(30_000);
    expect(invalidated()).toEqual([["notifications"], ["notifications"]]);

    act(() => source.onopen?.());
    vi.mocked(client.invalidateQueries).mockClear();
    vi.advanceTimersByTime(90_000);
    expect(client.invalidateQueries).not.toHaveBeenCalled();
});

it("leaves no timer after unmount or sign-out", () => {
    vi.useFakeTimers();
    const view = mount();
    act(() => FakeSource.all[0].onerror?.());
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);

    const again = mount();
    act(() => FakeSource.all[1].onerror?.());
    signedOut();
    again.rerender();
    expect(vi.getTimerCount()).toBe(0);
});

it("opens a new stream after the browser gave up, waiting longer each time and starting over once it opens", () => {
    vi.useFakeTimers();
    mount();
    const closed = (source: FakeSource) => { source.readyState = FakeSource.CLOSED; act(() => source.onerror?.()); };

    closed(FakeSource.all[0]);
    act(() => { vi.advanceTimersByTime(4_999); });
    expect(FakeSource.all).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(1); });
    expect(FakeSource.all).toHaveLength(2);
    expect(FakeSource.all[0].close).toHaveBeenCalledTimes(1);

    closed(FakeSource.all[1]);
    act(() => { vi.advanceTimersByTime(9_999); });
    expect(FakeSource.all).toHaveLength(2);
    act(() => { vi.advanceTimersByTime(1); });
    expect(FakeSource.all).toHaveLength(3);

    act(() => FakeSource.all[2].onopen?.());
    closed(FakeSource.all[2]);
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(FakeSource.all).toHaveLength(4);
});

it("never waits more than 30 s between tries", () => {
    vi.useFakeTimers();
    mount();
    for (let i = 0; i < 6; i++) {
        const source = FakeSource.all[i];
        source.readyState = FakeSource.CLOSED;
        act(() => source.onerror?.());
        act(() => { vi.advanceTimersByTime(30_000); });
    }
    expect(FakeSource.all).toHaveLength(7);
    const last = FakeSource.all[6];
    last.readyState = FakeSource.CLOSED;
    act(() => last.onerror?.());
    act(() => { vi.advanceTimersByTime(29_999); });
    expect(FakeSource.all).toHaveLength(7);
    act(() => { vi.advanceTimersByTime(1); });
    expect(FakeSource.all).toHaveLength(8);
});

it("leaves the browser alone while it is reconnecting by itself", () => {
    vi.useFakeTimers();
    mount();
    act(() => FakeSource.all[0].onerror?.());
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(FakeSource.all).toHaveLength(1);
});

it("cancels a waiting retry on unmount", () => {
    vi.useFakeTimers();
    const view = mount();
    FakeSource.all[0].readyState = FakeSource.CLOSED;
    act(() => FakeSource.all[0].onerror?.());
    view.unmount();
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(FakeSource.all).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
});

it("reopen closes the old stream and opens a new one", () => {
    const { result } = mount();
    act(() => result.current.reopen());
    expect(FakeSource.all).toHaveLength(2);
    expect(FakeSource.all[0].close).toHaveBeenCalledTimes(1);
    expect(FakeSource.all[1].close).not.toHaveBeenCalled();
});

it("reopens when the account's roles change", () => {
    const view = mount();
    view.rerender();
    expect(FakeSource.all).toHaveLength(1);
    signedIn(["resident", "volunteer"]);
    view.rerender();
    expect(FakeSource.all).toHaveLength(2);
    expect(FakeSource.all[0].close).toHaveBeenCalledTimes(1);
});

it("ignores a bad JSON message and unknown events", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mount();
    act(() => FakeSource.all[0].emit("notification", "{not json"));
    act(() => FakeSource.all[0].emit("something-else", {}));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(client.invalidateQueries).not.toHaveBeenCalled();
});

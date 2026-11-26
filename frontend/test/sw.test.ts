import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, expect, it, vi } from "vitest";

const code = readFileSync(resolve(__dirname, "../public/sw.js"), "utf8");

type Handler = (event: unknown) => void;
let handlers: Record<string, Handler>;
let windows: { focused: boolean; focus: () => Promise<unknown>; navigate: ReturnType<typeof vi.fn> }[];
const showNotification = vi.fn();
const openWindow = vi.fn();

beforeEach(() => {
    handlers = {};
    windows = [];
    showNotification.mockReset();
    openWindow.mockReset();
    const self = {
        addEventListener: (name: string, fn: Handler) => (handlers[name] = fn),
        location: { origin: "https://ecocollect.test" },
        registration: { showNotification },
        clients: { matchAll: () => Promise.resolve(windows), openWindow },
    };
    new Function("self", code)(self);
});

function addWindow(focused: boolean) {
    const win = { focused, navigate: vi.fn(), focus: () => Promise.resolve(win) };
    windows.push(win);
    return win;
}

async function fire(name: string, extra: object) {
    let done: Promise<unknown> = Promise.resolve();
    handlers[name]({ ...extra, waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
}

const push = (payload: object) => fire("push", { data: { json: () => payload } });
const payload = { notificationId: "n1", title: "New pickup", body: "2 items", url: "/volunteer/requests/1", tag: "request-1", silent: false };

it("still shows a push when a window is focused, but quietly", async () => {
    addWindow(true);
    await push(payload);
    expect(showNotification).toHaveBeenCalledWith("New pickup", expect.objectContaining({ tag: "request-1", silent: true }));
});

it("shows the notification when no window is focused", async () => {
    addWindow(false);
    await push(payload);
    expect(showNotification).toHaveBeenCalledWith("New pickup", {
        body: "2 items",
        tag: "request-1",
        silent: false,
        data: { url: "/volunteer/requests/1" },
    });
});

it("shows a silent push with the same tag even when a window is focused", async () => {
    addWindow(true);
    await push({ ...payload, body: "Updated", silent: true });
    expect(showNotification).toHaveBeenCalledWith("New pickup", expect.objectContaining({ tag: "request-1", silent: true }));
});

it("does nothing when the payload is not JSON", async () => {
    await fire("push", { data: { json: () => JSON.parse("oops") } });
    expect(showNotification).not.toHaveBeenCalled();
});

it("click focuses an open window and navigates it, or opens a new one", async () => {
    const notification = { close: vi.fn(), data: { url: "/volunteer/requests/1" } };
    await fire("notificationclick", { notification });
    expect(openWindow).toHaveBeenCalledWith("/volunteer/requests/1");

    const win = addWindow(false);
    await fire("notificationclick", { notification });
    expect(notification.close).toHaveBeenCalledTimes(2);
    expect(win.navigate).toHaveBeenCalledWith("/volunteer/requests/1");
    expect(openWindow).toHaveBeenCalledTimes(1);
});

it("opens a new window when the tab cannot be focused or navigated", async () => {
    const win = addWindow(false);
    win.navigate.mockRejectedValue(new Error("not controlled"));
    await fire("notificationclick", { notification: { close: vi.fn(), data: { url: "/volunteer/history" } } });
    expect(openWindow).toHaveBeenCalledWith("/volunteer/history");
});

it("goes to the home page when the url is missing", async () => {
    await fire("notificationclick", { notification: { close: vi.fn(), data: {} } });
    expect(openWindow).toHaveBeenCalledWith("/");
});

it("does not follow a url on another site", async () => {
    await fire("notificationclick", { notification: { close: vi.fn(), data: { url: "https://evil.example/login" } } });
    expect(openWindow).toHaveBeenCalledWith("/");
});

it("keeps the path of a full url from our own site", async () => {
    await fire("notificationclick", { notification: { close: vi.fn(), data: { url: "https://ecocollect.test/ecopoints?x=1" } } });
    expect(openWindow).toHaveBeenCalledWith("/ecopoints?x=1");
});

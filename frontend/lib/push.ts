import { api } from "@/lib/api";

export function pushSupported(): boolean {
    return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

// iPhone and iPad offer web push only to an app opened from the Home Screen (iOS 16.4 and later).
// An iPad says "Macintosh" by default, so a touch screen tells it apart from a Mac.
export function needsHomeScreen(): boolean {
    if (typeof window === "undefined") return false;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    const fromHomeScreen = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    return ios && !fromHomeScreen;
}

export async function isSubscribed(): Promise<boolean> {
    const registration = await navigator.serviceWorker.getRegistration();
    return Boolean(await registration?.pushManager.getSubscription());
}

// README 16.8: call this from a click. Returns the permission the user gave.
export async function subscribe(vapidKey: string): Promise<NotificationPermission> {
    // Safari wants the prompt straight from the click, so ask before awaiting anything else
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return permission;
    await navigator.serviceWorker.register("/sw.js");
    // subscribe() needs an active worker, and one registered a moment ago may not be active yet
    const registration = await navigator.serviceWorker.ready;
    // the VAPID key is base64url, the browser wants the raw bytes
    const base64 = vapidKey.replace(/-/g, "+").replace(/_/g, "/");
    const applicationServerKey = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    const { endpoint, keys, expirationTime } = subscription.toJSON();
    try {
        await api.post("/api/push/subscriptions", { endpoint, keys: { p256dh: keys?.p256dh, auth: keys?.auth }, expirationTime });
    } catch (err) {
        // Don't leave a browser subscription behind if the server rejected it, or the UI will falsely show "On".
        await subscription.unsubscribe().catch(() => {});
        throw err;
    }
    return permission;
}

export async function unsubscribe(): Promise<void> {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await subscription.unsubscribe();
    await api.delete("/api/push/subscriptions", { endpoint: subscription.endpoint });
}

// Re-registers the existing browser push subscription with the server without prompting again.
// Useful when the browser still has a subscription but the server row was removed.
export async function reconnectPush(): Promise<void> {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) {
        throw new Error("No browser push subscription found.");
    }
    const { endpoint, keys, expirationTime } = subscription.toJSON();
    await api.post("/api/push/subscriptions", {
        endpoint,
        keys: { p256dh: keys?.p256dh, auth: keys?.auth },
        expirationTime,
    });
}

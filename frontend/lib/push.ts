import { api } from "@/lib/api";

export function pushSupported(): boolean {
    return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
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
    await api.post("/api/push/subscriptions", { endpoint, keys: { p256dh: keys?.p256dh, auth: keys?.auth }, expirationTime });
    return permission;
}

export async function unsubscribe(): Promise<void> {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    await subscription.unsubscribe();
    await api.delete("/api/push/subscriptions", { endpoint: subscription.endpoint });
}

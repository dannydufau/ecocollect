import type { User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { api } from "@/lib/api";
import type { Role } from "@/lib/types";

export type { Role };

export async function getRoles(user: User): Promise<Role[]> {
    const result = await user.getIdTokenResult();
    const roles = result.claims.roles;
    if (!Array.isArray(roles)) {
        return [];
    }
    return roles.filter((role): role is Role => role === "resident" || role === "volunteer");
}

export function homeFor(roles: Role[]): string {
    if (roles.includes("resident") && roles.includes("volunteer")) {
        return "/choose-role";
    }
    if (roles.includes("resident")) {
        return "/resident";
    }
    if (roles.includes("volunteer")) {
        return "/volunteer";
    }
    return "/login";
}

export async function startSession(): Promise<void> {
    const user = auth.currentUser;
    if (!user) {
        return;
    }
    const idToken = await user.getIdToken();
    await api.post("/api/session", { idToken });
}

// README 3.5: tell the server to forget this browser's push subscription before the login goes away.
// Logging out must work even if this fails, so errors only get a warning.
export async function removePushSubscription(): Promise<void> {
    try {
        const registration = await navigator.serviceWorker?.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) await api.delete("/api/push/subscriptions", { endpoint: subscription.endpoint });
    } catch (err) {
        console.warn("Could not remove the push subscription", err);
    }
}

export async function cleanupSession(): Promise<void> {
    try {
        await api.delete("/api/session");
    } catch (err) {
        console.warn("Could not clear the session cookie", err);
    }
}
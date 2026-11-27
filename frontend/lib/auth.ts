import type { User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { api } from "@/lib/api";
import type { Role } from "@/lib/types";

export type { Role };

export type TokenState = {
    roles: Role[];
    emailVerified: boolean;
};

export async function getTokenState(user: User, forceRefresh = false): Promise<TokenState> {
    const result = await user.getIdTokenResult(forceRefresh);
    const rawRoles = result.claims.roles;
    const roles = Array.isArray(rawRoles)
        ? rawRoles.filter((role): role is Role => role === "resident" || role === "volunteer")
        : [];
    return {
        roles,
        emailVerified: result.claims.email_verified === true,
    };
}

export async function getRoles(user: User): Promise<Role[]> {
    const { roles } = await getTokenState(user);
    return roles;
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

export async function startSession(userOrToken?: User | string): Promise<void> {
    let idToken: string | undefined;
    if (typeof userOrToken === "string") {
        idToken = userOrToken;
    } else {
        const user = userOrToken ?? auth.currentUser;
        if (!user) return;
        idToken = await user.getIdToken();
    }
    if (!idToken) return;
    await api.post("/api/session", { idToken });
}

// README 3.5: tell the server to forget this browser's push subscription before the login goes away,
// and always unsubscribe the browser so the next sign-in doesn't see a stale "On" state or receive another account's pushes.
export async function removePushSubscription({ skipServer = false } = {}): Promise<void> {
    let subscription: PushSubscription | null | undefined;
    try {
        const registration = await navigator.serviceWorker?.getRegistration();
        subscription = await registration?.pushManager.getSubscription();
    } catch (err) {
        console.warn("Could not read the push subscription", err);
        return;
    }
    if (!subscription) return;
    if (!skipServer) {
        try {
            await api.delete("/api/push/subscriptions", { endpoint: subscription.endpoint });
        } catch (err) {
            console.warn("Could not remove the push subscription", err);
        }
    }
    try {
        await subscription.unsubscribe?.();
    } catch (err) {
        console.warn("Could not unsubscribe browser push", err);
    }
}

export async function cleanupSession(): Promise<void> {
    try {
        await api.delete("/api/session");
    } catch (err) {
        console.warn("Could not clear the session cookie", err);
    }
}

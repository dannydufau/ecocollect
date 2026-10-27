import { signOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { api } from "@/lib/api";

export type Role = "resident" | "volunteer";

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

export async function logout(): Promise<void> {
    try {
        await api.delete("/api/session");
    } catch (err) {
        console.warn("Could not clear the session cookie", err);
    }
    await signOut(auth);
}
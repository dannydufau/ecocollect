import type { Role } from "@/lib/auth";

const KEY = "returnTo";

// Only our own pages, so a stored value can never send the user to another site
function allowed(path: string): boolean {
    if (path.includes("//") || path.includes("\\")) return false;
    return path.startsWith("/resident/") || path.startsWith("/volunteer/")
        || /^\/(ecopoints|notifications|profile)([/?]|$)/.test(path);
}

export function roleOf(path: string): Role | null {
    if (path.startsWith("/resident/")) return "resident";
    if (path.startsWith("/volunteer/")) return "volunteer";
    return null;
}

export function saveReturnTo(path: string) {
    if (!allowed(path)) return;
    try {
        sessionStorage.setItem(KEY, path);
    } catch {}
}

// Reads the saved page once and forgets it
export function takeReturnTo(): string | null {
    let path: string | null = null;
    try {
        path = sessionStorage.getItem(KEY);
        sessionStorage.removeItem(KEY);
    } catch {}
    return path && allowed(path) ? path : null;
}

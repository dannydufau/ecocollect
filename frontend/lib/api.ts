import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

// The error body the contract promises: { error: { code, message, details: { fields } } }
type ErrorBody = { error?: { code?: unknown; message?: unknown; details?: { fields?: unknown } } };

export class ApiError extends Error {
    code: string;
    fields: Record<string, string>;

    constructor(
        public status: number,
        public body: unknown,
    ) {
        const error = (body as ErrorBody | null | undefined)?.error;
        super(typeof error?.message === "string" ? error.message : `API request failed with status ${status}`);
        this.name = "ApiError";
        // A proxy or a crashed service can answer with something that is not our error body.
        this.code = typeof error?.code === "string" ? error.code : "unknown";
        this.fields = {};
        const fields = error?.details?.fields;
        if (fields && typeof fields === "object") {
            for (const [name, text] of Object.entries(fields)) {
                if (typeof text === "string") this.fields[name] = text;
            }
        }
    }
}

// A 401 or 403 means the login or the role is wrong. Asking again won't fix it.
export function isAuthError(err: unknown): boolean {
    return err instanceof ApiError && (err.status === 401 || err.status === 403);
}

// Any 4xx means our request was wrong, so asking again won't help. Except 408 (timed out) and 429 (slow down),
// which usually work on the next try.
export function isClientError(err: unknown): boolean {
    return err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429;
}

// Sentences for the 409 codes in the contract. The wording of the first four is README 16.13.
const friendlyMessages: Record<string, string> = {
    window_ended: "The pickup window has ended. Confirm the collection or report a missed pickup.",
    expired: "This request has expired.",
    already_assigned: "Another volunteer accepted this request first.",
    terms_outdated: "The terms have changed. Please read and accept them again.",
    not_open: "This request is no longer open, so it can't be changed.",
    not_cancellable: "This request can't be cancelled now.",
    no_active_assignment: "This request has no active pickup.",
    already_collected: "The items have already been collected.",
    not_assigned: "This request is no longer assigned.",
    window_not_ended: "The pickup window hasn't ended yet.",
    not_collected: "Confirm the collection before recording a delivery.",
    already_delivered: "This delivery has already been recorded.",
    address_locked: "You can't change your address while you have an Open or Assigned request.",
    role_already_active: "You already have this role.",
    active_work: "You can't deactivate your account while you have requests or pickups in progress.",
    username_taken: "This username is already taken.",
    email_taken: "An account with this email already exists.",
};

// A sentence for people. The code decides the wording; the server message is the fallback because it can name the problem.
export function friendlyError(err: unknown): string {
    if (!(err instanceof ApiError)) return "We could not reach the server. Check your connection and try again.";
    // Own property only: a code like "toString" must not pick up a function from Object.prototype.
    return Object.hasOwn(friendlyMessages, err.code) ? friendlyMessages[err.code] : err.message;
}

async function getToken(): Promise<string | null> {
    await auth.authStateReady();
    const user = auth.currentUser;
    return user ? user.getIdToken() : null;
}

let endingSession: Promise<void> | undefined;

// Several calls can fail with 401 at once. They all wait for the same sign-out, so it and the redirect happen once.
function endExpiredSession(): Promise<void> {
    if (window.location.pathname.startsWith("/login")) return Promise.resolve();
    endingSession ??= (async () => {
        await signOut(auth).catch(() => {});
        // A full page load on purpose: this file has no router, and it also drops everything cached for the old session.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/login?expired=1");
    })().finally(() => { endingSession = undefined; });
    return endingSession;
}

async function request<T>(path: string, init: RequestInit): Promise<{ data: T; res: Response }> {
    const headers = new Headers(init.headers);

    const token = await getToken();
    if (token) {
        headers.set("Authorization", `Bearer ${token}`);
    }
    if (init.body !== undefined && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    const res = await fetch(path, { ...init, headers });

    const text = await res.text();
    let data: unknown = undefined;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }
    }

    if (!res.ok) {
        // The session ran out. /api/session is the login call itself, so a 401 there only means a wrong login.
        if (res.status === 401 && token && !path.startsWith("/api/session")) await endExpiredSession();
        throw new ApiError(res.status, data);
    }
    return { data: data as T, res };
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
    return (await request<T>(path, init)).data;
}

// post, patch and delete only differ in the method name
const withBody = (method: string) => <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
    get: <T>(path: string) => apiFetch<T>(path),
    // The request page times its refresh by the server clock (16.12), because the device clock can be wrong.
    getWithMeta: async <T>(path: string) => {
        const { data, res } = await request<T>(path, {});
        const date = new Date(res.headers.get("Date") ?? "");
        return { data, serverDate: Number.isNaN(date.getTime()) ? new Date() : date };
    },
    post: withBody("POST"),
    patch: withBody("PATCH"),
    delete: withBody("DELETE"),
};

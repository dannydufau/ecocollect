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

async function getToken(): Promise<string | null> {
    await auth.authStateReady();
    const user = auth.currentUser;
    return user ? user.getIdToken() : null;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
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
        throw new ApiError(res.status, data);
    }
    return data as T;

}

export const api = {
    get: <T>(path: string) => apiFetch<T>(path),
    post: <T>(path: string, body?: unknown) =>
        apiFetch<T>(path, {
            method: "POST",
            body: body === undefined ? undefined : JSON.stringify(body),
        }),
    delete: <T>(path: string, body?: unknown) =>
        apiFetch<T>(path, {
            method: "DELETE",
            body: body === undefined ? undefined : JSON.stringify(body),
        }),
};
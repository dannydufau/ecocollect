import { auth } from "@/lib/firebase";

export class ApiError extends Error {
    constructor(
        public status: number,
        public body: unknown,
    ) {
        super(`API request failed with status ${status}`);
        this.name = "ApiError";
    }
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
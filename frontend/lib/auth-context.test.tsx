import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { api } from "@/lib/api";
import { openSignalStream } from "@/lib/sse";
import { AuthProvider, useAuth } from "./auth-context";

const fb = vi.hoisted(() => ({
    auth: { currentUser: null as unknown },
    onAuthStateChanged: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({ auth: fb.auth }));
vi.mock("firebase/auth", () => ({
    onAuthStateChanged: fb.onAuthStateChanged,
    signInWithEmailAndPassword: fb.signInWithEmailAndPassword,
    signOut: fb.signOut,
}));
vi.mock("@/lib/api", () => ({ api: { post: vi.fn(), delete: vi.fn() } }));
vi.mock("@/lib/sse", () => ({ openSignalStream: vi.fn() }));

let listener: (user: unknown) => Promise<void>;
let calls: string[];

function fakeUser(uid: string, roles: string[]) {
    return { uid, getIdToken: vi.fn().mockResolvedValue(`token-${uid}`), getIdTokenResult: vi.fn().mockResolvedValue({ claims: { roles } }) };
}
function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient();
    return <QueryClientProvider client={client}><AuthProvider>{children}</AuthProvider></QueryClientProvider>;
}
async function mount(user: ReturnType<typeof fakeUser> | null = null) {
    const view = renderHook(() => useAuth(), { wrapper });
    fb.auth.currentUser = user;
    await act(async () => { await listener(user); });
    return view;
}
// A subscription in the browser, so logout has something to remove
function subscribed() {
    vi.stubGlobal("navigator", { serviceWorker: { getRegistration: async () => ({ pushManager: { getSubscription: async () => ({ endpoint: "https://push.example/abc" }) } }) } });
}

beforeEach(() => {
    calls = [];
    sessionStorage.clear();
    fb.auth.currentUser = null;
    fb.onAuthStateChanged.mockReset().mockImplementation((_auth, callback) => { listener = callback; return () => {}; });
    fb.signInWithEmailAndPassword.mockReset();
    fb.signOut.mockReset().mockImplementation(async () => { calls.push("firebase signOut"); });
    vi.mocked(api.post).mockReset().mockResolvedValue(undefined);
    vi.mocked(api.delete).mockReset().mockImplementation(async (path: string) => { calls.push(`DELETE ${path}`); });
    vi.mocked(openSignalStream).mockReset().mockReturnValue({ close: vi.fn() } as unknown as EventSource);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    subscribed();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("signIn reads the roles and posts the id token to the session route once", async () => {
    const user = fakeUser("u1", ["resident"]);
    fb.signInWithEmailAndPassword.mockImplementation(async () => {
        fb.auth.currentUser = user;
        void listener(user); // Firebase tells the listener at the same time
        return { user };
    });
    const { result } = await mount();
    let roles: string[] = [];
    await act(async () => { roles = await result.current.signIn("a@b.ca", "secret1"); });
    expect(roles).toEqual(["resident"]);
    expect(fb.signInWithEmailAndPassword).toHaveBeenCalledWith(fb.auth, "a@b.ca", "secret1");
    await waitFor(() => expect(result.current.user).toBe(user));
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/api/session", { idToken: "token-u1" });
});

it("signIn leaves out the session when the account has no role", async () => {
    const user = fakeUser("u1", []);
    fb.signInWithEmailAndPassword.mockResolvedValue({ user });
    const { result } = await mount();
    await act(async () => { await result.current.signIn("a@b.ca", "secret1"); });
    expect(api.post).not.toHaveBeenCalled();
});

it("signOut removes the push subscription, then the session, then signs out of Firebase", async () => {
    const { result } = await mount(fakeUser("u1", ["resident"]));
    await act(async () => { await result.current.signOut(); });
    expect(calls).toEqual(["DELETE /api/push/subscriptions", "DELETE /api/session", "firebase signOut"]);
    expect(api.delete).toHaveBeenCalledWith("/api/push/subscriptions", { endpoint: "https://push.example/abc" });
});

it("signOut still finishes when the push call fails", async () => {
    const { result } = await mount(fakeUser("u1", ["resident"]));
    vi.mocked(api.delete).mockImplementation(async (path: string) => {
        calls.push(`DELETE ${path}`);
        if (path === "/api/push/subscriptions") throw new Error("offline");
    });
    await act(async () => { await result.current.signOut(); });
    expect(calls).toEqual(["DELETE /api/push/subscriptions", "DELETE /api/session", "firebase signOut"]);
});

it("signOut with skipServer only signs out of Firebase", async () => {
    const { result } = await mount(fakeUser("u1", ["resident"]));
    calls.length = 0;
    await act(async () => { await result.current.signOut({ skipServer: true }); });
    expect(calls).toEqual(["firebase signOut"]);
});

it("deletes the session only once when the listener sees the sign out afterwards", async () => {
    const { result } = await mount(fakeUser("u1", ["resident"]));
    await act(async () => { await result.current.signOut(); });
    fb.auth.currentUser = null;
    await act(async () => { await listener(null); });
    expect(calls.filter((call) => call === "DELETE /api/session")).toHaveLength(1);
});

it("deletes the session when Firebase ends the login by itself", async () => {
    await mount(fakeUser("u1", ["resident"]));
    fb.auth.currentUser = null;
    await act(async () => { await listener(null); });
    expect(calls).toEqual(["DELETE /api/session"]);
});

it("picks the only role, and no role when the account has two", async () => {
    const one = await mount(fakeUser("u1", ["volunteer"]));
    expect(one.result.current.activeRole).toBe("volunteer");
    one.unmount();
    const two = await mount(fakeUser("u2", ["resident", "volunteer"]));
    expect(two.result.current.activeRole).toBeNull();
});

it("reads activeRole from sessionStorage and keeps it over a re-render", async () => {
    sessionStorage.setItem("activeRole", "volunteer");
    const { result, rerender } = await mount(fakeUser("u1", ["resident", "volunteer"]));
    expect(result.current.activeRole).toBe("volunteer");
    rerender();
    expect(result.current.activeRole).toBe("volunteer");
});

it("setActiveRole stores the role for this tab and ignores a role the account does not have", async () => {
    const { result } = await mount(fakeUser("u1", ["resident", "volunteer"]));
    act(() => result.current.setActiveRole("resident"));
    expect(result.current.activeRole).toBe("resident");
    expect(sessionStorage.getItem("activeRole")).toBe("resident");

    const single = await mount(fakeUser("u2", ["resident"]));
    act(() => single.result.current.setActiveRole("volunteer"));
    expect(single.result.current.activeRole).toBe("resident");
});

it("ignores a stored role the account no longer has", async () => {
    sessionStorage.setItem("activeRole", "volunteer");
    const { result } = await mount(fakeUser("u1", ["resident"]));
    expect(result.current.activeRole).toBe("resident");
});

it("works when sessionStorage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const { result } = await mount(fakeUser("u1", ["resident", "volunteer"]));
    expect(result.current.activeRole).toBeNull();
    act(() => result.current.setActiveRole("volunteer"));
    expect(result.current.activeRole).toBe("volunteer");
});

it("refreshRoles asks for a new token, starts the session again and reopens the stream", async () => {
    const user = fakeUser("u1", ["resident"]);
    const { result } = await mount(user);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(openSignalStream).toHaveBeenCalledTimes(1);

    user.getIdTokenResult.mockResolvedValue({ claims: { roles: ["resident", "volunteer"] } });
    let roles: string[] = [];
    await act(async () => { roles = await result.current.refreshRoles(); });
    expect(user.getIdToken).toHaveBeenCalledWith(true);
    expect(roles).toEqual(["resident", "volunteer"]);
    expect(result.current.roles).toEqual(["resident", "volunteer"]);
    expect(result.current.activeRole).toBe("resident");
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(openSignalStream).toHaveBeenCalledTimes(2);
});

it("refreshRoles drops the answer when another account signed in meanwhile", async () => {
    const alice = fakeUser("alice", ["resident", "volunteer"]);
    const bob = fakeUser("bob", ["volunteer"]);
    const { result } = await mount(alice);
    let release = () => {};
    alice.getIdToken.mockReturnValueOnce(new Promise<string>((resolve) => { release = () => resolve("fresh"); }));
    let refresh!: Promise<string[]>;
    act(() => { refresh = result.current.refreshRoles(); });
    fb.auth.currentUser = bob;
    await act(async () => { await listener(bob); });
    vi.mocked(api.post).mockClear();
    vi.mocked(openSignalStream).mockClear();
    await act(async () => { release(); expect(await refresh).toEqual([]); });
    expect(result.current.user).toBe(bob);
    expect(result.current.roles).toEqual(["volunteer"]);
    expect(api.post).not.toHaveBeenCalled();
    expect(openSignalStream).not.toHaveBeenCalled();
});

it("signOut waits for a session request that is still pending, so the cookie ends up deleted", async () => {
    const { result } = await mount(fakeUser("u1", ["resident"]));
    let land = () => {};
    vi.mocked(api.post).mockImplementationOnce(() => new Promise<undefined>((resolve) => { land = () => { calls.push("POST /api/session"); resolve(undefined); }; }));
    let refresh!: Promise<string[]>;
    let leaving!: Promise<void>;
    await act(async () => { refresh = result.current.refreshRoles(); });
    await act(async () => { leaving = result.current.signOut(); });
    expect(calls).toEqual(["DELETE /api/push/subscriptions"]);
    await act(async () => { land(); await Promise.all([refresh, leaving]); });
    expect(calls).toEqual(["DELETE /api/push/subscriptions", "POST /api/session", "DELETE /api/session", "firebase signOut"]);
});

it("refreshRoles does nothing when nobody is signed in", async () => {
    const { result } = await mount();
    await act(async () => { expect(await result.current.refreshRoles()).toEqual([]); });
    expect(api.post).not.toHaveBeenCalled();
});

it("useAuth outside the provider says what is wrong", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow("useAuth must be used inside AuthProvider");
});

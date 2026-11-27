import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { api } from "@/lib/api";
import { AuthProvider, useAuth } from "./auth-context";

const fb = vi.hoisted(() => ({
    auth: { currentUser: null as unknown },
    onAuthStateChanged: vi.fn(),
    reload: vi.fn(),
    sendEmailVerification: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({ auth: fb.auth }));
vi.mock("firebase/auth", () => ({
    onAuthStateChanged: fb.onAuthStateChanged,
    reload: fb.reload,
    sendEmailVerification: fb.sendEmailVerification,
    signInWithEmailAndPassword: fb.signInWithEmailAndPassword,
    signOut: fb.signOut,
}));
vi.mock("@/lib/api", () => ({ api: { post: vi.fn(), delete: vi.fn() } }));

let listener: (user: unknown) => Promise<void>;
let calls: string[];

function fakeUser(uid: string, roles: string[], emailVerified = true) {
    return {
        uid,
        email: `${uid}@example.com`,
        getIdToken: vi.fn().mockResolvedValue(`token-${uid}`),
        getIdTokenResult: vi.fn().mockResolvedValue({ claims: { roles, email_verified: emailVerified } }),
    };
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
    fb.reload.mockReset().mockResolvedValue(undefined);
    fb.sendEmailVerification.mockReset().mockResolvedValue(undefined);
    fb.signInWithEmailAndPassword.mockReset();
    fb.signOut.mockReset().mockImplementation(async () => { calls.push("firebase signOut"); });
    vi.mocked(api.post).mockReset().mockResolvedValue(undefined);
    vi.mocked(api.delete).mockReset().mockImplementation(async (path: string) => { calls.push(`DELETE ${path}`); });
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
    let signInResult: { roles: string[]; emailVerified: boolean } | undefined;
    await act(async () => { signInResult = await result.current.signIn("a@b.ca", "secret1"); });
    expect(signInResult?.roles).toEqual(["resident"]);
    expect(signInResult?.emailVerified).toBe(true);
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

it("refreshRoles asks for a new token and starts the session again", async () => {
    const user = fakeUser("u1", ["resident"]);
    const { result } = await mount(user);
    expect(api.post).toHaveBeenCalledTimes(1);

    user.getIdTokenResult.mockResolvedValue({ claims: { roles: ["resident", "volunteer"], email_verified: true } });
    let roles: string[] = [];
    await act(async () => { roles = await result.current.refreshRoles(); });
    expect(user.getIdTokenResult).toHaveBeenCalledWith(true);
    expect(roles).toEqual(["resident", "volunteer"]);
    expect(result.current.roles).toEqual(["resident", "volunteer"]);
    expect(result.current.activeRole).toBe("resident");
    expect(api.post).toHaveBeenCalledTimes(2);
});

it("refreshRoles drops the answer when another account signed in meanwhile", async () => {
    const alice = fakeUser("alice", ["resident", "volunteer"]);
    const bob = fakeUser("bob", ["volunteer"]);
    const { result } = await mount(alice);
    let release = () => {};
    alice.getIdTokenResult.mockReturnValueOnce(new Promise((resolve) => {
        release = () => resolve({ claims: { roles: ["resident", "volunteer"], email_verified: true } });
    }));
    let refresh!: Promise<string[]>;
    act(() => { refresh = result.current.refreshRoles(); });
    fb.auth.currentUser = bob;
    await act(async () => { await listener(bob); });
    vi.mocked(api.post).mockClear();
    await act(async () => { release(); expect(await refresh).toEqual([]); });
    expect(result.current.user).toBe(bob);
    expect(result.current.roles).toEqual(["volunteer"]);
    expect(api.post).not.toHaveBeenCalled();
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

it("sets verificationState to check-failed on token-read failure without removing push subscriptions", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", {
        serviceWorker: {
            getRegistration: async () => ({ pushManager: { getSubscription: async () => ({ endpoint: "https://push.example/abc", unsubscribe }) } }),
        },
    });
    const user = fakeUser("u1", ["resident"]);
    user.getIdTokenResult.mockRejectedValueOnce(new Error("offline"));
    const { result } = await mount(user);
    expect(result.current.user).toBe(user);
    expect(result.current.verificationState).toBe("check-failed");
    expect(result.current.rolesError).toBe(true);
    expect(unsubscribe).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
});

it("publishes unverified state immediately while local push cleanup is delayed, and aborts cleanup on account switch", async () => {
    let releaseReg!: (reg: unknown) => void;
    const unsubscribe = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", {
        serviceWorker: {
            getRegistration: () => new Promise((resolve) => { releaseReg = resolve; }),
        },
    });
    const unverifiedUser = fakeUser("unv", ["resident"], false);
    const { result } = await mount(unverifiedUser);
    // Signed-in unverified state is published even though getRegistration is still pending.
    expect(result.current.loading).toBe(false);
    expect(result.current.user).toBe(unverifiedUser);
    expect(result.current.verificationState).toBe("unverified");

    // Account switches to a verified user before the delayed cleanup finishes.
    const verifiedUser = fakeUser("ver", ["resident"], true);
    fb.auth.currentUser = verifiedUser;
    await act(async () => { await listener(verifiedUser); });
    releaseReg({ pushManager: { getSubscription: async () => ({ endpoint: "https://push.example/new", unsubscribe }) } });
    await act(async () => { await Promise.resolve(); });
    expect(unsubscribe).not.toHaveBeenCalled();
});

it("cleans up when an account switches during an in-flight session POST so the old cookie cannot linger", async () => {
    const alice = fakeUser("alice", ["resident"], true);
    const bob = fakeUser("bob", ["volunteer"], true);
    let resolveAlicePost!: () => void;
    vi.mocked(api.post).mockImplementationOnce((_path, body) => new Promise<undefined>((resolve) => {
        resolveAlicePost = () => {
            calls.push(`POST /api/session ${(body as { idToken: string }).idToken}`);
            resolve(undefined);
        };
    })).mockImplementation(async (_path, body) => {
        calls.push(`POST /api/session ${(body as { idToken: string }).idToken}`);
    });

    const view = renderHook(() => useAuth(), { wrapper });
    fb.auth.currentUser = alice;
    let aliceListener!: Promise<void>;
    act(() => { aliceListener = listener(alice); });
    await waitFor(() => expect(resolveAlicePost).toBeDefined());

    // Switch to Bob while Alice's POST is still in flight.
    fb.auth.currentUser = bob;
    let bobListener!: Promise<void>;
    act(() => { bobListener = listener(bob); });

    await act(async () => {
        resolveAlicePost();
        await Promise.all([aliceListener, bobListener]);
    });

    // Alice's stale POST is followed by DELETE /api/session, then Bob's POST runs last.
    expect(calls).toEqual([
        "POST /api/session token-alice",
        "DELETE /api/session",
        "POST /api/session token-bob",
    ]);
    expect(view.result.current.user).toBe(bob);
});

it("makes a fresh POST /api/session on renewSession after an initial session failure", async () => {
    const user = fakeUser("u1", ["resident"], true);
    vi.mocked(api.post)
        .mockRejectedValueOnce(new Error("temporary 502"))
        .mockResolvedValueOnce(undefined);

    const { result } = await mount(user);
    expect(api.post).toHaveBeenCalledTimes(1);

    let renewed = false;
    await act(async () => { renewed = await result.current.renewSession(); });
    expect(renewed).toBe(true);
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(api.post).toHaveBeenLastCalledWith("/api/session", { idToken: "token-u1" });
});

it("recheckVerification reloads the user, force-refreshes token, starts session, and marks verified", async () => {
    const user = fakeUser("u1", ["resident"], false);
    const { result } = await mount(user);
    expect(result.current.verificationState).toBe("unverified");
    expect(api.post).not.toHaveBeenCalled();

    user.getIdTokenResult.mockResolvedValueOnce({ claims: { roles: ["resident"], email_verified: true } });
    let outcome: "verified" | "unverified" = "unverified";
    await act(async () => { outcome = await result.current.recheckVerification(); });
    expect(fb.reload).toHaveBeenCalledWith(user);
    expect(user.getIdTokenResult).toHaveBeenCalledWith(true);
    expect(outcome).toBe("verified");
    expect(result.current.verificationState).toBe("verified");
    expect(api.post).toHaveBeenCalledWith("/api/session", { idToken: "token-u1" });
});

it("signIn returns check-failed instead of throwing when Firebase auth succeeds but token reading fails", async () => {
    const user = fakeUser("u1", ["resident"], true);
    user.getIdTokenResult.mockRejectedValue(new Error("offline"));
    fb.signInWithEmailAndPassword.mockImplementation(async () => {
        fb.auth.currentUser = user;
        return { user };
    });
    const { result } = await mount();
    let signInResult: { status: string } | undefined;
    await act(async () => { signInResult = await result.current.signIn("a@b.ca", "secret1"); });
    expect(signInResult?.status).toBe("check-failed");
    expect(result.current.user).toBe(user);
    expect(result.current.verificationState).toBe("check-failed");
    expect(api.post).not.toHaveBeenCalled();
});

it("shares an in-flight renewSession POST for the same account", async () => {
    const user = fakeUser("u1", ["resident"], true);
    const { result } = await mount(user);
    vi.mocked(api.post).mockClear();

    let resolvePost!: () => void;
    vi.mocked(api.post).mockImplementationOnce(() => new Promise<undefined>((resolve) => {
        resolvePost = () => resolve(undefined);
    }));

    let p1!: Promise<boolean>;
    let p2!: Promise<boolean>;
    act(() => {
        p1 = result.current.renewSession();
        p2 = result.current.renewSession();
    });
    await waitFor(() => expect(resolvePost).toBeDefined());
    expect(api.post).toHaveBeenCalledTimes(1);

    await act(async () => {
        resolvePost();
        expect(await Promise.all([p1, p2])).toEqual([true, true]);
    });
    expect(api.post).toHaveBeenCalledTimes(1);
});

it("clears inFlightSession when a queued POST is skipped after an account switch so signing back in posts a fresh session", async () => {
    const alice = fakeUser("alice", ["resident"], true);
    const bob = fakeUser("bob", ["volunteer"], true);

    let resolveAlicePost!: () => void;
    vi.mocked(api.post).mockImplementationOnce(() => new Promise<undefined>((resolve) => {
        resolveAlicePost = () => resolve(undefined);
    })).mockResolvedValue(undefined);

    const view = renderHook(() => useAuth(), { wrapper });
    // 1. Alice starts a session POST (in flight).
    fb.auth.currentUser = alice;
    let aliceFirst!: Promise<void>;
    act(() => { aliceFirst = listener(alice); });
    await waitFor(() => expect(resolveAlicePost).toBeDefined());

    // 2. Switch to Bob -> Bob's session POST is queued behind Alice's in-flight POST.
    fb.auth.currentUser = bob;
    let bobSkipped!: Promise<void>;
    act(() => { bobSkipped = listener(bob); });

    // 3. Switch away from Bob before Bob's queued POST runs, so Bob's queued POST returns false early.
    fb.auth.currentUser = null;
    let signedOut!: Promise<void>;
    act(() => { signedOut = listener(null); });

    await act(async () => {
        resolveAlicePost();
        await Promise.all([aliceFirst, bobSkipped, signedOut]);
    });

    // 4. Sign back into Bob: must NOT reuse the settled false promise; a fresh POST /api/session must succeed.
    vi.mocked(api.post).mockClear();
    fb.auth.currentUser = bob;
    await act(async () => { await listener(bob); });
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith("/api/session", { idToken: "token-bob" });

    // Forced renewal for Bob also succeeds with a fresh POST.
    let renewed = false;
    await act(async () => { renewed = await view.result.current.renewSession(); });
    expect(renewed).toBe(true);
    expect(api.post).toHaveBeenCalledTimes(2);
});

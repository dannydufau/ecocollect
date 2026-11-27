"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  cleanupSession,
  getTokenState,
  removePushSubscription,
  startSession,
  type Role,
} from "@/lib/auth";
import { dropCacheIfUserChanged } from "@/lib/query-cache";

export type VerificationState = "checking" | "check-failed" | "unverified" | "verified";

export type SignInResult =
  | { user: User; status: "verified"; roles: Role[]; emailVerified: true }
  | { user: User; status: "unverified"; roles: Role[]; emailVerified: false }
  | { user: User; status: "check-failed"; roles: Role[]; emailVerified: false };

type AuthState = {
  user: User | null;
  roles: Role[];
  activeRole: Role | null;
  loading: boolean;
  rolesError: boolean;
  verificationState: VerificationState;
};

type AuthValue = AuthState & {
  setActiveRole: (role: Role) => void;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: (options?: { skipServer?: boolean }) => Promise<void>;
  refreshRoles: () => Promise<Role[]>;
  retryRoles: () => Promise<void>;
  renewSession: () => Promise<boolean>;
  sendVerificationEmail: (targetUser?: User) => Promise<void>;
  recheckVerification: () => Promise<"verified" | "unverified">;
};

const ROLE_KEY = "activeRole";

// sessionStorage is per tab (README 17.2). It can throw when the browser blocks storage, so the app works without it.
function storeRole(role: Role | null) {
  try {
    if (role) sessionStorage.setItem(ROLE_KEY, role);
    else sessionStorage.removeItem(ROLE_KEY);
  } catch {}
}

// The role this tab chose before, if the account still has it. A single role needs no choice.
function pickRole(roles: Role[]): Role | null {
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(ROLE_KEY);
  } catch {}
  return roles.find((role) => role === stored) ?? (roles.length === 1 ? roles[0] : null);
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    roles: [],
    activeRole: null,
    loading: true,
    rolesError: false,
    verificationState: "checking",
  });
  const queryClient = useQueryClient();
  const lastUid = useRef<string | null>(null);
  const authEpoch = useRef(0);

  // Ordered session queue: serializes POST /api/session and DELETE /api/session across
  // sign-out and account switches so a late POST cannot leave an old cookie active.
  const sessionChain = useRef<Promise<unknown>>(Promise.resolve());
  const inFlightSession = useRef<{ uid: string; promise: Promise<boolean> } | null>(null);
  const sessionActiveUid = useRef<string | null>(null);

  function ensureSession(user: User, { force = false } = {}): Promise<boolean> {
    // Always share an in-flight POST /api/session for the same account.
    if (inFlightSession.current?.uid === user.uid) {
      return inFlightSession.current.promise;
    }
    if (!force && sessionActiveUid.current === user.uid) {
      return Promise.resolve(true);
    }

    const run: Promise<boolean> = sessionChain.current
      .catch(() => {})
      .then(async () => {
        if (auth.currentUser?.uid !== user.uid) return false;
        // Contract 16.1: register the service worker at login (push permission stays on click, 16.8).
        if (typeof navigator !== "undefined" && typeof navigator.serviceWorker?.register === "function") {
          void navigator.serviceWorker.register("/sw.js").catch(() => {});
        }
        try {
          await startSession(user);
          if (auth.currentUser?.uid !== user.uid) {
            await cleanupSession();
            return false;
          }
          sessionActiveUid.current = user.uid;
          return true;
        } catch (err) {
          // The app works without the cookie, but live updates (SSE) do not.
          // Do not cache failure: the next retry must make a fresh POST /api/session.
          console.warn("Could not start the session", err);
          if (sessionActiveUid.current === user.uid) sessionActiveUid.current = null;
          return false;
        } finally {
          if (inFlightSession.current?.promise === run) {
            inFlightSession.current = null;
          }
        }
      });

    sessionChain.current = run;
    inFlightSession.current = { uid: user.uid, promise: run };
    return run;
  }

  function endSession(): Promise<void> {
    sessionActiveUid.current = null;
    const run = sessionChain.current
      .catch(() => {})
      .then(async () => {
        await cleanupSession();
        sessionActiveUid.current = null;
      });
    sessionChain.current = run;
    return run;
  }

  // Best-effort local push cleanup guarded against account switches / newer auth epochs.
  function cleanupLocalPushGuarded(epoch: number, expectedUid: string | null) {
    void (async () => {
      if (authEpoch.current !== epoch) return;
      if ((auth.currentUser?.uid ?? null) !== expectedUid) return;
      let subscription: PushSubscription | null | undefined;
      try {
        const registration = await navigator.serviceWorker?.getRegistration();
        subscription = await registration?.pushManager.getSubscription();
      } catch (err) {
        console.warn("Could not read the push subscription", err);
        return;
      }
      if (!subscription) return;
      if (authEpoch.current !== epoch || (auth.currentUser?.uid ?? null) !== expectedUid) return;
      try {
        await subscription.unsubscribe?.();
      } catch (err) {
        console.warn("Could not unsubscribe browser push", err);
      }
    })();
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const epoch = ++authEpoch.current;
      const previousUid = lastUid.current;
      const nextUid = user?.uid ?? null;

      // Every way of signing out ends up here, so the previous person's cached lists and drafts go for all of them.
      dropCacheIfUserChanged(queryClient, previousUid, nextUid);
      // Clear drafts only when signing out or switching accounts, not on initial page-load hydration (null -> uid).
      if (previousUid && previousUid !== nextUid) {
        try {
          for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const k = sessionStorage.key(i);
            if (k?.startsWith("ecocollect:draft:")) sessionStorage.removeItem(k);
          }
        } catch {}
      }

      if (!user) {
        // signOut below already did this. It is still needed when Firebase ends the login by itself (expired token).
        if (sessionActiveUid.current || inFlightSession.current) {
          await endSession();
        }
        storeRole(null);
        lastUid.current = null;
        if (authEpoch.current !== epoch) return;
        setState({
          user: null,
          roles: [],
          activeRole: null,
          loading: false,
          rolesError: false,
          verificationState: "checking",
        });
        if (previousUid) cleanupLocalPushGuarded(epoch, null);
        return;
      }

      lastUid.current = user.uid;

      // Read roles and email_verified claim together. A failed token read leaves the user signed in
      // and leaves push subscriptions untouched.
      let roles: Role[] = [];
      let emailVerified = false;
      try {
        const tokenState = await getTokenState(user);
        roles = tokenState.roles;
        emailVerified = tokenState.emailVerified;
      } catch {
        if (user.uid !== auth.currentUser?.uid || authEpoch.current !== epoch) return;
        setState({
          user,
          roles: [],
          activeRole: null,
          loading: false,
          rolesError: true,
          verificationState: "check-failed",
        });
        return;
      }

      if (user.uid !== auth.currentUser?.uid || authEpoch.current !== epoch) return;

      if (!emailVerified) {
        // Publish signed-in unverified state before best-effort local push cleanup.
        setState({
          user,
          roles,
          activeRole: pickRole(roles),
          loading: false,
          rolesError: false,
          verificationState: "unverified",
        });
        cleanupLocalPushGuarded(epoch, user.uid);
        return;
      }

      if (roles.length > 0) {
        await ensureSession(user);
      }
      if (user.uid !== auth.currentUser?.uid || authEpoch.current !== epoch) {
        return;
      }

      setState({
        user,
        roles,
        activeRole: pickRole(roles),
        loading: false,
        rolesError: false,
        verificationState: "verified",
      });
    });
    return () => unsubscribe();
  }, [queryClient]);

  function setActiveRole(role: Role) {
    if (!state.roles.includes(role)) return;
    storeRole(role);
    setState((current) => ({ ...current, activeRole: role }));
  }

  async function signIn(email: string, password: string): Promise<SignInResult> {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    let roles: Role[];
    let emailVerified: boolean;
    try {
      const tokenState = await getTokenState(user);
      roles = tokenState.roles;
      emailVerified = tokenState.emailVerified;
    } catch {
      if (auth.currentUser?.uid === user.uid) {
        setState({
          user,
          roles: [],
          activeRole: null,
          loading: false,
          rolesError: true,
          verificationState: "check-failed",
        });
      }
      return { user, status: "check-failed", roles: [], emailVerified: false };
    }
    if (!emailVerified) {
      return { user, status: "unverified", roles, emailVerified: false };
    }
    if (roles.length > 0 && auth.currentUser?.uid === user.uid) {
      await ensureSession(user);
    }
    return { user, status: "verified", roles, emailVerified: true };
  }

  // README 3.5: push subscription first, then the session cookie, then Firebase. The cached lists go in the listener.
  // After a deactivation the server has already ended everything and its calls would only fail with a 401,
  // so skipServer leaves them out and only signs out of Firebase.
  async function signOut({ skipServer = false } = {}) {
    authEpoch.current += 1;
    if (skipServer) {
      sessionActiveUid.current = null;
      await removePushSubscription({ skipServer: true });
    } else {
      await removePushSubscription({ skipServer: state.verificationState !== "verified" });
      await endSession();
    }
    await firebaseSignOut(auth);
  }

  // After a role was added the token still has the old claims (README 3.3), so ask for a new one and start over.
  async function refreshRoles(): Promise<Role[]> {
    const user = auth.currentUser;
    if (!user) return [];
    const { roles, emailVerified } = await getTokenState(user, true);
    // Somebody else may have signed in while we waited, these roles are not theirs
    if (auth.currentUser?.uid !== user.uid) return [];
    if (emailVerified && roles.length > 0) await ensureSession(user, { force: true });
    if (auth.currentUser?.uid !== user.uid) return [];
    setState((current) => ({
      ...current,
      roles,
      rolesError: false,
      verificationState: emailVerified ? "verified" : "unverified",
      activeRole: roles.includes(current.activeRole as Role) ? current.activeRole : pickRole(roles),
    }));
    return roles;
  }

  async function retryRoles(): Promise<void> {
    const user = auth.currentUser;
    if (!user) return;
    const epoch = authEpoch.current;
    setState((current) => ({ ...current, loading: true, rolesError: false, verificationState: "checking" }));
    try {
      const { roles, emailVerified } = await getTokenState(user);
      if (auth.currentUser?.uid !== user.uid || authEpoch.current !== epoch) return;
      if (!emailVerified) {
        setState({
          user,
          roles,
          activeRole: pickRole(roles),
          loading: false,
          rolesError: false,
          verificationState: "unverified",
        });
        cleanupLocalPushGuarded(epoch, user.uid);
        return;
      }
      if (roles.length > 0) await ensureSession(user);
      if (auth.currentUser?.uid !== user.uid || authEpoch.current !== epoch) return;
      setState({
        user,
        roles,
        activeRole: pickRole(roles),
        loading: false,
        rolesError: false,
        verificationState: "verified",
      });
    } catch {
      if (auth.currentUser?.uid !== user.uid || authEpoch.current !== epoch) return;
      setState((current) => ({ ...current, loading: false, rolesError: true, verificationState: "check-failed" }));
    }
  }

  async function renewSession(): Promise<boolean> {
    const user = auth.currentUser;
    if (!user || state.verificationState !== "verified") return false;
    return ensureSession(user, { force: true });
  }

  async function sendVerificationEmail(targetUser?: User): Promise<void> {
    const user = targetUser ?? auth.currentUser;
    if (!user || auth.currentUser?.uid !== user.uid) {
      throw new Error("No matching signed-in account.");
    }
    await sendEmailVerification(user);
  }

  async function recheckVerification(): Promise<"verified" | "unverified"> {
    const user = auth.currentUser;
    if (!user) return "unverified";
    await reload(user);
    if (auth.currentUser?.uid !== user.uid) return "unverified";
    const { roles, emailVerified } = await getTokenState(user, true);
    if (auth.currentUser?.uid !== user.uid) return "unverified";
    if (!emailVerified) {
      setState((current) => ({
        ...current,
        user,
        roles,
        activeRole: pickRole(roles),
        loading: false,
        rolesError: false,
        verificationState: "unverified",
      }));
      return "unverified";
    }
    if (roles.length > 0) {
      await ensureSession(user, { force: true });
    }
    if (auth.currentUser?.uid !== user.uid) return "unverified";
    setState((current) => ({
      ...current,
      user,
      roles,
      activeRole: roles.includes(current.activeRole as Role) ? current.activeRole : pickRole(roles),
      loading: false,
      rolesError: false,
      verificationState: "verified",
    }));
    return "verified";
  }

  return (
    <AuthContext.Provider
      value={{
        ...state,
        setActiveRole,
        signIn,
        signOut,
        refreshRoles,
        retryRoles,
        renewSession,
        sendVerificationEmail,
        recheckVerification,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

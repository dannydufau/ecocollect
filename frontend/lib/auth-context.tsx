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
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  cleanupSession,
  getRoles,
  removePushSubscription,
  startSession,
  type Role,
} from "@/lib/auth";
import { dropCacheIfUserChanged } from "@/lib/query-cache";

type AuthState = {
  user: User | null;
  roles: Role[];
  activeRole: Role | null;
  loading: boolean;
  rolesError: boolean;
};

type AuthValue = AuthState & {
  setActiveRole: (role: Role) => void;
  signIn: (email: string, password: string) => Promise<Role[]>;
  signOut: (options?: { skipServer?: boolean }) => Promise<void>;
  refreshRoles: () => Promise<Role[]>;
  retryRoles: () => Promise<void>;
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
  });
  const queryClient = useQueryClient();
  const lastUid = useRef<string | null>(null);
  // signIn and the auth listener both start the session, this makes sure the cookie is asked for only once per login
  const session = useRef<{ uid: string; started: Promise<boolean> } | null>(null);
  // Session requests still on their way. One that lands after the logout would set the cookie again.
  const pending = useRef(new Set<Promise<boolean>>());

  function beginSession(user: User, again = false): Promise<boolean> {
    if (!again && session.current?.uid === user.uid) return session.current.started;
    // Contract 16.1: register the service worker at login (push permission stays on click, 16.8).
    if (typeof navigator !== "undefined" && typeof navigator.serviceWorker?.register === "function") {
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const started = startSession().then(
      () => true,
      (err) => {
        // The app works without the cookie, but live updates (SSE) do not.
        console.warn("Could not start the session", err);
        return false;
      },
    );
    session.current = { uid: user.uid, started };
    pending.current.add(started);
    void started.then(() => pending.current.delete(started));
    return started;
  }

  async function endSession() {
    await Promise.all(pending.current);
    await cleanupSession();
    session.current = null;
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Every way of signing out ends up here, so the previous person's cached lists and drafts go for all of them.
      dropCacheIfUserChanged(queryClient, lastUid.current, user?.uid ?? null);
      // Clear drafts only when signing out or switching accounts, not on initial page-load hydration (null -> uid).
      if (lastUid.current && lastUid.current !== (user?.uid ?? null)) {
        try {
          for (let i = sessionStorage.length - 1; i >= 0; i--) {
            const k = sessionStorage.key(i);
            if (k?.startsWith("ecocollect:draft:")) sessionStorage.removeItem(k);
          }
        } catch {}
      }

      if (!user) {
        // signOut below already did this. It is still needed when Firebase ends the login by itself (expired token).
        if (session.current) await endSession();
        if (lastUid.current) await removePushSubscription({ skipServer: true });
        storeRole(null);
      }

      lastUid.current = user?.uid ?? null;

      // Distinguish a failed role lookup (network error) from an account with no roles so we don't sign people out.
      let roles: Role[] = [];
      let rolesError = false;
      if (user) {
        try {
          roles = await getRoles(user);
        } catch {
          rolesError = true;
        }
      }
      if (user && roles.length > 0) {
        await beginSession(user);
      }
      if (user?.uid !== auth.currentUser?.uid) {
        // user changed while setting up the session, state no longer valid
        return;
      }

      setState({ user, roles, activeRole: pickRole(roles), loading: false, rolesError });
    });
    return () => unsubscribe();
  }, [queryClient]);

  function setActiveRole(role: Role) {
    if (!state.roles.includes(role)) return;
    storeRole(role);
    setState((current) => ({ ...current, activeRole: role }));
  }

  async function signIn(email: string, password: string): Promise<Role[]> {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    const roles = await getRoles(user);
    if (roles.length > 0) await beginSession(user);
    return roles;
  }

  // README 3.5: push subscription first, then the session cookie, then Firebase. The cached lists go in the listener.
  // After a deactivation the server has already ended everything and its calls would only fail with a 401,
  // so skipServer leaves them out and only signs out of Firebase.
  async function signOut({ skipServer = false } = {}) {
    if (skipServer) {
      session.current = null;
      await removePushSubscription({ skipServer: true });
    } else {
      await removePushSubscription();
      await endSession();
    }
    await firebaseSignOut(auth);
  }

  // After a role was added the token still has the old claims (README 3.3), so ask for a new one and start over.
  async function refreshRoles(): Promise<Role[]> {
    const user = auth.currentUser;
    if (!user) return [];
    await user.getIdToken(true);
    const roles = await getRoles(user);
    // Somebody else may have signed in while we waited, these roles are not theirs
    if (auth.currentUser?.uid !== user.uid) return [];
    if (roles.length > 0) await beginSession(user, true);
    if (auth.currentUser?.uid !== user.uid) return [];
    setState((current) => ({
      ...current,
      roles,
      rolesError: false,
      activeRole: roles.includes(current.activeRole as Role) ? current.activeRole : pickRole(roles),
    }));
    return roles;
  }

  async function retryRoles(): Promise<void> {
    const user = auth.currentUser;
    if (!user) return;
    setState((current) => ({ ...current, loading: true, rolesError: false }));
    try {
      const roles = await getRoles(user);
      if (auth.currentUser?.uid !== user.uid) return;
      if (roles.length > 0) await beginSession(user);
      if (auth.currentUser?.uid !== user.uid) return;
      setState({ user, roles, activeRole: pickRole(roles), loading: false, rolesError: false });
    } catch {
      if (auth.currentUser?.uid !== user.uid) return;
      setState((current) => ({ ...current, loading: false, rolesError: true }));
    }
  }

  return (
    <AuthContext.Provider value={{ ...state, setActiveRole, signIn, signOut, refreshRoles, retryRoles }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

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
import { openSignalStream } from "@/lib/sse";

type AuthState = {
  user: User | null;
  roles: Role[];
  activeRole: Role | null;
  loading: boolean;
};

type AuthValue = AuthState & {
  setActiveRole: (role: Role) => void;
  signIn: (email: string, password: string) => Promise<Role[]>;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<Role[]>;
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
  });
  const queryClient = useQueryClient();
  const lastUid = useRef<string | null>(null);
  const sseStreamSource = useRef<EventSource | null>(null);
  // signIn and the auth listener both start the session, this makes sure the cookie is asked for only once per login
  const session = useRef<{ uid: string; started: Promise<boolean> } | null>(null);
  // Session requests still on their way. One that lands after the logout would set the cookie again.
  const pending = useRef(new Set<Promise<boolean>>());

  function beginSession(user: User, again = false): Promise<boolean> {
    if (!again && session.current?.uid === user.uid) return session.current.started;
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
    const cleanupStream = () => {
      sseStreamSource.current?.close();
      sseStreamSource.current = null;
    };

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      let sessionOk = false;
      cleanupStream();
      // Every way of signing out ends up here, so the previous person's cached lists go for all of them.
      dropCacheIfUserChanged(queryClient, lastUid.current, user?.uid ?? null);

      if (!user) {
        // signOut below already did this. It is still needed when Firebase ends the login by itself (expired token).
        if (session.current) await endSession();
        storeRole(null);
      }

      lastUid.current = user?.uid ?? null;

      // If reading the token fails (network), treat the user as having no role instead of loading forever.
      const roles = user ? await getRoles(user).catch(() => []) : [];
      if (user && roles.length > 0) {
        sessionOk = await beginSession(user);
      }
      if (user?.uid !== auth.currentUser?.uid) {
        // user changed while setting up the session, state no longer valid
        return;
      }

      if (sessionOk) {
        cleanupStream();
        sseStreamSource.current = openSignalStream(queryClient);
      }

      setState({ user, roles, activeRole: pickRole(roles), loading: false });
    });
    return () => {
      unsubscribe();
      cleanupStream();
    };
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
  async function signOut() {
    await removePushSubscription();
    await endSession();
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
    const sessionOk = roles.length > 0 && (await beginSession(user, true));
    if (auth.currentUser?.uid !== user.uid) return [];
    if (sessionOk) {
      sseStreamSource.current?.close();
      sseStreamSource.current = openSignalStream(queryClient);
    }
    setState((current) => ({
      ...current,
      roles,
      activeRole: roles.includes(current.activeRole as Role) ? current.activeRole : pickRole(roles),
    }));
    return roles;
  }

  return (
    <AuthContext.Provider value={{ ...state, setActiveRole, signIn, signOut, refreshRoles }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

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
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { cleanupSession, getRoles, startSession, type Role } from "@/lib/auth";
import { dropCacheIfUserChanged } from "@/lib/query-cache";
import { openSignalStream } from "@/lib/sse";

type AuthState = {
  user: User | null;
  roles: Role[];
  loading: boolean;
};

const AuthContext = createContext<AuthState>({
  user: null,
  roles: [],
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    roles: [],
    loading: true,
  });
  const queryClient = useQueryClient();
  const lastUid = useRef<string | null>(null);
  const sseStreamSource = useRef<EventSource | null>(null);

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

      if (lastUid.current && !user) {
        //User logged out
        await cleanupSession();
      }

      lastUid.current = user?.uid ?? null;

      // If reading the token fails (network), treat the user as having no role instead of loading forever.
      const roles = user ? await getRoles(user).catch(() => []) : [];
      if (roles.length > 0) {
        try {
          await startSession();
          sessionOk = true;
        } catch (err) {
          // The app works without the cookie, but live updates (SSE) do not.
          console.warn("Could not start the session", err);
          sessionOk = false;
        }
      }
      if (user?.uid !== auth.currentUser?.uid) {
        // user changed while setting up the session, state no longer valid
        return;
      }

      if (sessionOk) {
        cleanupStream();
        sseStreamSource.current = openSignalStream(queryClient);
      }

      setState({ user, roles, loading: false });
    });
    return () => {
      unsubscribe();
      cleanupStream();
    };
  }, [queryClient]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

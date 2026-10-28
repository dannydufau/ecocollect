"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getRoles, type Role } from "@/lib/auth";
import { dropCacheIfUserChanged } from "@/lib/query-cache";

type AuthState = {
    user: User | null;
    roles: Role[];
    loading: boolean;
}

const AuthContext = createContext<AuthState>({ user: null, roles: [], loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AuthState>({ user: null, roles: [], loading: true });
    const queryClient = useQueryClient();
    const lastUid = useRef<string | null>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            // Every way of signing out ends up here, so the previous person's cached lists go for all of them.
            dropCacheIfUserChanged(queryClient, lastUid.current, user?.uid ?? null);
            lastUid.current = user?.uid ?? null;
            // If reading the token fails (network), treat the user as having no role instead of loading forever.
            const roles = user ? await getRoles(user).catch(() => []) : [];
            setState({ user, roles, loading: false });
        });
        return unsubscribe;
    }, [queryClient]);

    return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
    return useContext(AuthContext);
}
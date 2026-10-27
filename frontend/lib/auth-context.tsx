"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getRoles, type Role } from "@/lib/auth";

type AuthState = {
    user: User | null;
    roles: Role[];
    loading: boolean;
}

const AuthContext = createContext<AuthState>({ user: null, roles: [], loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AuthState>({ user: null, roles: [], loading: true });

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            const roles = user ? await getRoles(user) : [];
            setState({ user, roles, loading: false });
        });
        return unsubscribe;
    }, []);

    return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
    return useContext(AuthContext);
}
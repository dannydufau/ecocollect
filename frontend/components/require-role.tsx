"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { homeFor, type Role } from "@/lib/auth";

export default function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
    const { user, roles, loading } = useAuth();
    const router = useRouter();
    const allowed = user !== null && roles.includes(role);

    useEffect(() => {
        if (loading || allowed) {
            return;
        }
        router.replace(user ? homeFor(roles) : "/login");
    }, [loading, allowed, user, roles, router]);

    if (!allowed) {
        return <p className="p-8">Loading...</p>;
    }
    return <>{children}</>;
}
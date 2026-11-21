"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PageLoading } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import type { Role } from "@/lib/auth";
import { saveReturnTo } from "@/lib/return-to";

export default function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
    const { user, roles, activeRole, loading, setActiveRole } = useAuth();
    const router = useRouter();
    const synced = useRef(false);
    const allowed = user !== null && roles.includes(role);

    useEffect(() => {
        if (loading) {
            return;
        }
        if (!user) {
            saveReturnTo(window.location.pathname + window.location.search);
            router.replace("/login");
            return;
        }
        if (!allowed) {
            router.replace(roles.length === 0 ? "/login" : "/choose-role");
            return;
        }
        // Opening this role's page picks the role, but only on arrival so the header's role switch is not undone
        if (!synced.current) {
            synced.current = true;
            if (activeRole !== role) setActiveRole(role);
        }
    }, [loading, user, allowed, roles, role, activeRole, setActiveRole, router]);

    if (!allowed) {
        return <PageLoading />;
    }
    return <>{children}</>;
}

"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PageLoading, QueryError } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import type { Role } from "@/lib/auth";
import { saveReturnTo } from "@/lib/return-to";

export default function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
    const { user, roles, activeRole, loading, verificationState, setActiveRole, retryRoles } = useAuth();
    const router = useRouter();
    const synced = useRef(false);
    const allowed = user !== null && verificationState === "verified" && roles.includes(role);

    useEffect(() => {
        if (loading) {
            return;
        }
        if (!user) {
            saveReturnTo(window.location.pathname + window.location.search);
            router.replace("/login");
            return;
        }
        if (verificationState === "checking" || verificationState === "check-failed") {
            return;
        }
        if (verificationState === "unverified") {
            saveReturnTo(window.location.pathname + window.location.search);
            router.replace("/verify-email");
            return;
        }
        if (!allowed) {
            router.replace(roles.length === 0 ? "/login" : `/choose-role?need=${role}`);
            return;
        }
        // Opening this role's page picks the role, but only on arrival so the header's role switch is not undone
        if (!synced.current) {
            synced.current = true;
            if (activeRole !== role) setActiveRole(role);
        }
    }, [loading, user, verificationState, allowed, roles, role, activeRole, setActiveRole, router]);

    if (user && verificationState === "check-failed") {
        return (
            <main className="flex flex-1 items-center justify-center p-8">
                <div className="w-full max-w-sm">
                    <QueryError
                        message="We could not verify your account status. Check your connection and try again."
                        onRetry={() => void retryRoles()}
                    />
                </div>
            </main>
        );
    }

    if (!allowed) {
        return <PageLoading />;
    }
    return <>{children}</>;
}

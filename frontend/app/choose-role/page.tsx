"use client";

import { Suspense, useEffect, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import type { Role } from "@/lib/auth";
import { roleOf, takeReturnTo } from "@/lib/return-to";
import { Alert, ChevronRightIcon, PackageIcon, PageLoading, QueryError, RoleBadge, TruckIcon, card, pageTitle } from "@/components/ui";

const labels: Record<Role, { text: string; icon: ReactNode }> = {
    resident: { text: "Request e-waste pickups", icon: <PackageIcon className="size-7 text-accent-700" /> },
    volunteer: { text: "Pick up items and deliver them", icon: <TruckIcon className="size-7 text-accent-2-800" /> },
};

function ChooseRoleContent() {
    const { user, roles, loading, rolesError, setActiveRole, signOut, retryRoles } = useAuth();
    const router = useRouter();
    const need = useSearchParams().get("need");
    const needRole: Role | null = need === "resident" || need === "volunteer" ? need : null;
    const ready = !loading && user !== null && roles.length > 0;

    useEffect(() => {
        if (loading || ready || rolesError) return;
        // An account with no roles can't use the app. Signing out makes user null and this runs again.
        if (user) void signOut();
        else router.replace("/login");
    }, [loading, ready, rolesError, user, signOut, router]);

    function choose(role: Role) {
        const path = takeReturnTo();
        const owner = path ? roleOf(path) : null;
        // A saved page of the other role wins when the account has that role too (README 16.14)
        if (path && (!owner || roles.includes(owner))) {
            setActiveRole(owner ?? role);
            router.push(path);
            return;
        }
        setActiveRole(role);
        router.push(`/${role}`);
    }

    if (rolesError && user) {
        return (
            <main className="flex w-full min-w-0 flex-1 flex-col items-center justify-center p-4 sm:p-8">
                <div className="flex w-full max-w-sm flex-col gap-4">
                    <h1 className={pageTitle}>Continue as</h1>
                    <QueryError message="We could not load your account roles. Check your connection and try again." onRetry={() => void retryRoles()} />
                </div>
            </main>
        );
    }

    if (!ready) {
        return <PageLoading />;
    }

    return (
        <main className="flex w-full min-w-0 flex-1 flex-col items-center justify-center p-4 sm:p-8">
            <div className="flex w-full max-w-sm flex-col gap-4">
                <h1 className={pageTitle}>Continue as</h1>
                {needRole && <Alert variant="info">That page is for {needRole}s. Choose how you want to continue.</Alert>}
                {user.email && <p className="break-words text-text-muted">Signed in as {user.email}</p>}
                {roles.map((role) => (
                    <button key={role} type="button" onClick={() => choose(role)}
                        className={`${card} flex min-h-11 w-full items-center gap-4 px-6 py-4 text-left hover:bg-accent-200`}>
                        {labels[role].icon}
                        <span className="flex min-w-0 flex-1 flex-col">
                            <span><RoleBadge role={role} /></span>
                            <span className="text-text-muted">{labels[role].text}</span>
                        </span>
                        <ChevronRightIcon className="size-5 flex-none text-text-muted" />
                    </button>
                ))}
            </div>
        </main>
    );
}

export default function ChooseRolePage() {
    return (
        <Suspense fallback={<PageLoading />}>
            <ChooseRoleContent />
        </Suspense>
    );
}

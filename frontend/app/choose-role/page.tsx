"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import type { Role } from "@/lib/auth";
import { roleOf, takeReturnTo } from "@/lib/return-to";
import { PageLoading, card, pageTitle } from "@/components/ui";

const labels: Record<Role, { name: string; text: string }> = {
    resident: { name: "Resident", text: "Request e-waste pickups" },
    volunteer: { name: "Volunteer", text: "Pick up items and deliver them" },
};

export default function ChooseRolePage() {
    const { user, roles, loading, setActiveRole, signOut } = useAuth();
    const router = useRouter();
    const ready = !loading && user !== null && roles.length > 0;

    useEffect(() => {
        if (loading || ready) return;
        // An account with no roles can't use the app. Signing out makes user null and this runs again.
        if (user) void signOut();
        else router.replace("/login");
    }, [loading, ready, user, signOut, router]);

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

    if (!ready) {
        return <PageLoading />;
    }

    return (
        <main className="mx-auto flex w-full max-w-sm min-w-0 flex-col gap-4 p-4 sm:p-8">
            <h1 className={pageTitle}>Continue as</h1>
            {roles.map((role) => (
                <button key={role} type="button" onClick={() => choose(role)}
                    className={`${card} flex min-h-11 w-full flex-col px-6 py-4 text-left hover:bg-accent-200`}>
                    <span className="text-lg font-bold">{labels[role].name}</span>
                    <span className="text-neutral-800">{labels[role].text}</span>
                </button>
            ))}
        </main>
    );
}

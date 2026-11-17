"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import type { Role } from "@/lib/auth";
import { roleOf, takeReturnTo } from "@/lib/return-to";
import { Button } from "@/components/ui";

const labels: Record<Role, string> = { resident: "Resident", volunteer: "Volunteer" };

export default function ChooseRolePage() {
    const { user, roles, loading, setActiveRole } = useAuth();
    const router = useRouter();
    const ready = !loading && user !== null && roles.length > 0;

    useEffect(() => {
        if (!loading && !ready) {
            router.replace("/login");
        }
    }, [loading, ready, router]);

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
        return <p className="p-8">Loading...</p>;
    }

    return (
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 p-8">
            <h1 className="text-2xl font-semibold">Continue as</h1>
            {roles.map((role) => (
                <Button key={role} onClick={() => choose(role)} className="w-full">{labels[role]}</Button>
            ))}
        </main>
    );
}

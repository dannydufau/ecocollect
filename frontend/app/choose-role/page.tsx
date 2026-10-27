"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { homeFor } from "@/lib/auth";

export default function ChooseRolePage() {
    const { user, roles, loading } = useAuth();
    const router = useRouter();
    const hasBoth = roles.includes("resident") && roles.includes("volunteer");

    useEffect(() => {
        if (loading || hasBoth) {
            return;
        }
        router.replace(user ? homeFor(roles) : "/login");
    }, [loading, hasBoth, user, roles, router]);

    if (!hasBoth) {
        return <p className="p-8">Loading...</p>;
    }

    return (
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 p-8">
            <h1 className="text-2xl font-semibold">Continue as</h1>
            <Link href="/resident" className="rounded border px-4 py-3 text-center">
                Resident
            </Link>
            <Link href="/volunteer" className="rounded border px-4 py-3 text-center">
                Volunteer
            </Link>
        </main>
    );
}
"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { saveReturnTo } from "@/lib/return-to";

export default function RequireAuth({ children }: { children: ReactNode }) {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (loading || user) return;
        saveReturnTo(window.location.pathname + window.location.search);
        router.replace("/login");
    }, [loading, user, router]);

    if (loading || !user) {
        return <div className="flex flex-1 items-center justify-center p-8"><Spinner label="Loading..." /></div>;
    }
    return <>{children}</>;
}

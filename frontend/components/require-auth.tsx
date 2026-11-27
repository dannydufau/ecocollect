"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { QueryError, Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { saveReturnTo } from "@/lib/return-to";

export default function RequireAuth({ children }: { children: ReactNode }) {
    const { user, loading, verificationState, retryRoles } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (loading) return;
        if (!user) {
            saveReturnTo(window.location.pathname + window.location.search);
            router.replace("/login");
            return;
        }
        if (verificationState === "checking" || verificationState === "check-failed") return;
        if (verificationState === "unverified") {
            saveReturnTo(window.location.pathname + window.location.search);
            router.replace("/verify-email");
        }
    }, [loading, user, verificationState, router]);

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

    if (loading || !user || verificationState !== "verified") {
        return <div className="flex flex-1 items-center justify-center p-8"><Spinner label="Loading..." /></div>;
    }
    return <>{children}</>;
}

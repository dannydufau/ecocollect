"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithCustomToken } from "firebase/auth";
import { Alert, Button, card, pageTitle } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { auth } from "@/lib/firebase";

export default function DemoPage() {
    const router = useRouter();
    const { user, roles, loading } = useAuth();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    // The auth listener starts the session and the stream after the sign in, like after a login
    useEffect(() => {
        if (!loading && user && roles.length > 0) router.replace("/choose-role");
    }, [loading, user, roles, router]);

    async function start() {
        if (busy) return;
        setBusy(true);
        setError("");
        try {
            const { customToken } = await api.post<{ customToken: string }>("/api/demo/session");
            await signInWithCustomToken(auth, customToken);
        } catch (err) {
            setError(err instanceof ApiError && err.status === 429
                ? "Many people are starting the demo right now. Wait a moment and try again."
                : "We could not start the demo. Please try again.");
            setBusy(false);
        }
    }

    return (
        <main className="p-4 sm:p-8">
            <div className="mx-auto max-w-3xl space-y-6">
                <h1 className={pageTitle}>Try EcoCollect</h1>
                <section className={`${card} space-y-4`}>
                    <p>You get your own demo account with both roles: resident and volunteer.</p>
                    <p>Everyone shares this demo data. It resets every night. Open a second tab to try the other role.</p>
                    {error && <Alert variant="error">{error}</Alert>}
                    <Button onClick={() => void start()} busy={busy} busyLabel="Starting...">Start demo</Button>
                </section>
            </div>
        </main>
    );
}

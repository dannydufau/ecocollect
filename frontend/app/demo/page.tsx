"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { signInWithCustomToken } from "firebase/auth";
import { Alert, Button, card, pageTitle, textLink } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { isDemo } from "@/lib/demo";
import { auth } from "@/lib/firebase";

export default function DemoPage() {
    // Only the demo build has this page (spec 3)
    if (!isDemo) notFound();
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
                ? "Too many demo sessions from your network. Try again in a minute."
                : "We could not start the demo. Please try again.");
            setBusy(false);
        }
    }

    return (
        <main className="p-4 sm:p-8">
            <div className="mx-auto max-w-sm space-y-6">
                <h1 className={pageTitle}>Try EcoCollect</h1>
                <section className={`${card} space-y-4`}>
                    <p>This is a demo with sample data. Everyone shares it and it resets every night. Open a second tab to try the other role.</p>
                    {error && <Alert variant="error">{error}</Alert>}
                    <Button onClick={() => void start()} busy={busy} busyLabel="Starting...">Start demo</Button>
                    <p><Link href="/stats" className={textLink}>Community stats</Link></p>
                </section>
            </div>
        </main>
    );
}

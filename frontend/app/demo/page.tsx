"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
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
        <main className="flex w-full min-w-0 flex-1 flex-col items-center justify-center p-4 sm:p-8">
            <section aria-labelledby="demo-title" className={`${card} w-full max-w-[460px] min-w-0 space-y-4`}>
                <Image src="/ecocollect-mark.png" alt="" width={61} height={64} priority />
                <h1 id="demo-title" className={pageTitle}>Try EcoCollect</h1>
                <p>This is a demo with sample data. Everyone shares it and it resets every night. Open a second tab to try the other role.</p>
                {error && <Alert variant="error">{error}</Alert>}
                <Button onClick={() => void start()} busy={busy} busyLabel="Starting..." className="w-full">Start demo</Button>
                <hr className="border-border" />
                <p className="text-center"><Link href="/stats" className={textLink}>Community stats</Link></p>
            </section>
        </main>
    );
}

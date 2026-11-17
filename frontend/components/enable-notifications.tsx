"use client";

import { useEffect, useState } from "react";
import { Alert, Button } from "@/components/ui";
import { isSubscribed, pushSupported, subscribe } from "@/lib/push";

type View = "checking" | "hidden" | "button" | "blocked" | "no-key";

async function firstView(vapidKey: string): Promise<View> {
    if (!pushSupported()) return "hidden";
    if (!vapidKey) return "no-key";
    if (Notification.permission === "denied") return "blocked";
    if (Notification.permission === "granted" && await isSubscribed().catch(() => false)) return "hidden";
    return "button";
}

export default function EnableNotifications() {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_KEY ?? "";
    const [view, setView] = useState<View>("checking");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        let active = true;
        firstView(vapidKey).then((next) => { if (active) setView(next); });
        return () => { active = false; };
    }, [vapidKey]);

    async function turnOn() {
        setBusy(true);
        setError("");
        try {
            const permission = await subscribe(vapidKey);
            if (permission === "granted") setView("hidden");
            if (permission === "denied") setView("blocked");
        } catch {
            setError("We could not turn on notifications. Please try again.");
        } finally {
            setBusy(false);
        }
    }

    if (view === "checking" || view === "hidden") return null;
    if (view === "no-key") return <Alert variant="info">Notifications are not set up yet.</Alert>;
    if (view === "blocked") return <Alert variant="warning">Notifications are blocked. Allow them in your browser settings.</Alert>;
    return (
        <div className="space-y-2">
            <Button onClick={turnOn} busy={busy} busyLabel="Turning on...">Turn on notifications</Button>
            {error && <Alert variant="error">{error}</Alert>}
        </div>
    );
}

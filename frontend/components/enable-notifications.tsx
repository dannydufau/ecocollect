"use client";

import { useEffect, useState } from "react";
import { Alert, Button } from "@/components/ui";
import { isSubscribed, pushSupported, subscribe } from "@/lib/push";

type View = "checking" | "on" | "unsupported" | "button" | "blocked" | "no-key";

async function firstView(vapidKey: string): Promise<View> {
    if (!pushSupported()) return "unsupported";
    if (!vapidKey) return "no-key";
    if (Notification.permission === "denied") return "blocked";
    if (Notification.permission === "granted" && await isSubscribed().catch(() => false)) return "on";
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
            if (permission === "granted") setView("on");
            if (permission === "denied") setView("blocked");
        } catch {
            setError("We could not turn on notifications. Please try again.");
        } finally {
            setBusy(false);
        }
    }

    if (view === "checking") return null;
    if (view === "on") return <p role="status">Device notifications are on.</p>;
    if (view === "unsupported") return <p role="status">This browser does not support device notifications.</p>;
    if (view === "no-key") return <Alert variant="info">Notifications are not set up yet.</Alert>;
    if (view === "blocked") return <Alert variant="info">Notifications are blocked for this site. You can turn them on in your browser settings.</Alert>;
    return (
        <div className="space-y-2">
            <Button variant="secondary" onClick={turnOn} busy={busy} busyLabel="Turning on...">Turn on device notifications</Button>
            {error && <Alert variant="error">{error}</Alert>}
        </div>
    );
}

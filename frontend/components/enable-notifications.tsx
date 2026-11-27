"use client";

import { useEffect, useState } from "react";
import { Alert, BellIcon, Button } from "@/components/ui";
import { isSubscribed, needsHomeScreen, pushSupported, reconnectPush, subscribe } from "@/lib/push";

type View = "checking" | "on" | "unsupported" | "home-screen" | "button" | "blocked" | "no-key";

async function firstView(vapidKey: string): Promise<View> {
    if (needsHomeScreen()) return "home-screen";
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
    const [reconnecting, setReconnecting] = useState(false);
    const [reconnectStatus, setReconnectStatus] = useState<"idle" | "ok" | "error">("idle");
    const [notice, setNotice] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        let active = true;
        firstView(vapidKey).then((next) => { if (active) setView(next); });
        return () => { active = false; };
    }, [vapidKey]);

    async function turnOn() {
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const permission = await subscribe(vapidKey);
            if (permission === "granted") {
                setReconnectStatus("idle");
                setView("on");
            }
            if (permission === "denied") setView("blocked");
        } catch {
            setError("We could not turn on notifications. Please try again.");
        } finally {
            setBusy(false);
        }
    }

    async function handleReconnect() {
        setReconnecting(true);
        setReconnectStatus("idle");
        setNotice("");
        try {
            const outcome = await reconnectPush();
            if (outcome === "missing") {
                const next = await firstView(vapidKey);
                setView(next);
                if (next === "button") {
                    setNotice("Device notifications were turned off in this browser. Turn them on again below.");
                }
                return;
            }
            setReconnectStatus("ok");
        } catch {
            setReconnectStatus("error");
        } finally {
            setReconnecting(false);
        }
    }

    if (view === "checking") return null;
    if (view === "on") {
        return (
            <div className="space-y-2">
                <p role="status" className="flex flex-wrap items-center gap-2">
                    <BellIcon className="size-5" />
                    <strong>On</strong>
                    <span>You will get notifications on this device.</span>
                </p>
                <Button variant="secondary" size="sm" onClick={() => void handleReconnect()} busy={reconnecting} busyLabel="Reconnecting...">
                    Reconnect device notifications
                </Button>
                {reconnectStatus === "ok" && <Alert variant="info">Device notifications reconnected.</Alert>}
                {reconnectStatus === "error" && (
                    <Alert variant="error">We could not reconnect device notifications. Please try again.</Alert>
                )}
            </div>
        );
    }
    if (view === "unsupported") return <p role="status">This browser does not support device notifications.</p>;
    if (view === "home-screen") return <Alert variant="info">
        On iPhone and iPad, notifications work when EcoCollect is on your Home Screen. Tap the Share button, then Add to Home Screen,
        and open EcoCollect from there to turn them on.
    </Alert>;
    if (view === "no-key") return <Alert variant="info">Notifications are not set up yet.</Alert>;
    if (view === "blocked") return <div className="space-y-2">
        <p className="flex items-center gap-2"><BellIcon className="size-5" /><strong>Blocked</strong></p>
        <Alert variant="info">Notifications are blocked for this site. You can turn them on in your browser settings.</Alert>
    </div>;
    return (
        <div className="space-y-2">
            {notice && <Alert variant="info">{notice}</Alert>}
            <Button variant="secondary" onClick={turnOn} busy={busy} busyLabel="Turning on..."><span className="inline-flex items-center gap-2"><BellIcon className="size-5" />Turn on device notifications</span></Button>
            {error && <Alert variant="error">{error}</Alert>}
        </div>
    );
}

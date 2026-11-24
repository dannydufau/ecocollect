"use client";

import { useState } from "react";

// When the status changes by itself (a volunteer accepts while the page is open), screen readers hear it and the badge and
// sentence fade in again. Nothing happens on the first load, or when the person's own action caused the change (quiet).
export function useStatusCue(status: string, quiet: boolean) {
    const [seen, setSeen] = useState(status);
    const [announcement, setAnnouncement] = useState("");
    const [cue, setCue] = useState(0);
    // Derived from the props while rendering, so no effect and no extra render
    if (status !== seen) {
        setSeen(status);
        setAnnouncement(quiet ? "" : `Status updated: ${status}.`);
        if (!quiet) setCue(cue + 1);
    }
    return { announcement, cue };
}

export function StatusAnnouncer({ message }: { message: string }) {
    return <p role="status" className="sr-only">{message}</p>;
}

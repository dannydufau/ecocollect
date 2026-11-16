import { useEffect, useRef } from "react";

// README 13.5: the public profile and stats pages refetch when this stream says something changed.
export function usePublicStream({ profile, stats }: { profile?: string; stats?: boolean }, onChange: () => void) {
    if (process.env.NODE_ENV === "development" && Boolean(profile) === Boolean(stats)) {
        throw new Error("usePublicStream needs exactly one of profile or stats");
    }

    // The page can pass a new function on every render, the stream should not reopen for that
    const latest = useRef(onChange);
    useEffect(() => { latest.current = onChange; });

    useEffect(() => {
        const url = profile ? `/api/public/events?profile=${encodeURIComponent(profile)}` : stats ? "/api/public/events?stats" : null;
        if (!url) return;
        const source = new EventSource(url);
        const changed = () => latest.current();
        source.addEventListener("public-profile-updated", changed);
        source.addEventListener("stats-updated", changed);
        return () => source.close();
    }, [profile, stats]);
}

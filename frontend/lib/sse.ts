import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { startSession } from "@/lib/auth";
import { useAuth } from "@/lib/auth-context";
import { keysFor } from "@/lib/invalidate";
import { queryKeys } from "@/lib/query-keys";
import type { Notification } from "@/lib/types";

const RETRY_FIRST = 5_000;
const RETRY_MAX = 30_000;

export const StreamContext = createContext<() => void>(() => {});

// Lets any page reopen the stream
export function useReopenStream() {
    return useContext(StreamContext);
}

// Closes the device notifications with these tags, or all of them when tags is null (README 13.3)
async function closeShown(tags: string[] | null) {
    try {
        if (!("serviceWorker" in navigator)) return;
        const registration = await navigator.serviceWorker.ready;
        const lists = await Promise.all(tags ? tags.map((tag) => registration.getNotifications({ tag })) : [registration.getNotifications()]);
        lists.flat().forEach((shown) => shown.close());
    } catch {}
}

// README 13.3 and 16.5: one stream per tab while signed in with a role
export function useEventStream() {
    const { user, roles, signOut, refreshRoles } = useAuth();
    const queryClient = useQueryClient();
    const [opened, setOpened] = useState(0);
    const [delayed, setDelayed] = useState(false);
    // How long to wait before opening the stream again after the browser gave up on it
    const retryDelay = useRef(RETRY_FIRST);
    const failures = useRef(0);
    const uid = user && roles.length > 0 ? user.uid : null;
    const roleList = roles.join(",");

    // signOut and refreshRoles are new on every render, the stream should not reopen for that
    const latest = useRef({ signOut, refreshRoles });
    useEffect(() => { latest.current = { signOut, refreshRoles }; });

    useEffect(() => {
        if (!uid || typeof EventSource === "undefined") return;
        const source = new EventSource("/api/events", { withCredentials: true });
        let timer: ReturnType<typeof setInterval> | undefined;
        let retry: ReturnType<typeof setTimeout> | undefined;
        const stopTimer = () => {
            clearInterval(timer);
            timer = undefined;
        };
        const invalidate = (queryKey: readonly unknown[]) => queryClient.invalidateQueries({ queryKey });

        function on<T>(name: string, handle: (data: T) => void) {
            source.addEventListener(name, (event) => {
                let data: T;
                try {
                    data = JSON.parse((event as MessageEvent).data) as T;
                } catch (error) {
                    console.warn("Ignoring a bad SSE message", error);
                    return;
                }
                handle(data);
            });
        }

        on<{ type: string; requestId: string | null }>("notification", (data) => {
            keysFor(data.type, data.requestId).forEach(invalidate);
        });
        on<{ tag: string }>("notification-expired", (data) => {
            invalidate(queryKeys.notifications);
            void closeShown([data.tag]);
        });
        on<{ notificationIds?: string[]; all?: boolean }>("notification-read", (data) => {
            // The read event has only ids, so the tags (README 13.1) come from the cached list
            const page = queryClient.getQueryData<{ notifications: Notification[] }>(queryKeys.notifications);
            const tags = (page?.notifications ?? [])
                .filter((item) => data.notificationIds?.includes(item.notificationId))
                .map((item) => (item.awardId ? `award-${item.awardId}` : `request-${item.requestId}`));
            invalidate(queryKeys.notifications);
            if (data.all) void closeShown(null);
            else if (tags.length > 0) void closeShown(tags);
        });
        on<{ changed: string[] }>("profile-updated", (data) => {
            invalidate(queryKeys.profile);
            if (data.changed?.includes("roles")) void latest.current.refreshRoles();
        });
        on<{ requestId: string }>("available-requests-changed", (data) => {
            invalidate(queryKeys.availableRequests);
            invalidate(queryKeys.request(data.requestId));
        });
        on("account-deactivated", () => void latest.current.signOut({ skipServer: true }));

        source.onopen = () => {
            stopTimer();
            retryDelay.current = RETRY_FIRST;
            failures.current = 0;
            setDelayed(false);
            queryClient.invalidateQueries();
        };
        // The browser reconnects by itself, meanwhile the bell is kept fresh by asking every 30 s
        source.onerror = () => {
            failures.current += 1;
            if (failures.current >= 2) setDelayed(true);
            timer ??= setInterval(() => invalidate(queryKeys.notifications), 30_000);
            // After a non-200 answer (a 502 while the service restarts, or a 401 when the initial session call failed)
            // the browser gives up for good (issue #59), so refresh the session cookie and open a new stream later
            if (source.readyState === EventSource.CLOSED && retry === undefined) {
                void startSession().catch(() => {});
                retry = setTimeout(() => setOpened((count) => count + 1), retryDelay.current);
                retryDelay.current = Math.min(retryDelay.current * 2, RETRY_MAX);
            }
        };

        return () => {
            stopTimer();
            clearTimeout(retry);
            source.close();
        };
    }, [uid, roleList, opened, queryClient]);

    const reopen = useCallback(() => setOpened((count) => count + 1), []);
    return { reopen, delayed: Boolean(uid) && delayed };
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, BellIcon, Button, EmptyState, LeafIcon, MapPinIcon, QueryError, Spinner, TruckIcon, pageTitle } from "@/components/ui";
import { api, isAuthError } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { formatTimestamp } from "@/lib/time";
import type { Notification } from "@/lib/types";
import { useNotifications } from "@/lib/use-notifications";

const PAGE_SIZE = 30;

function typeIcon(type: string) {
    const className = "mt-0.5 size-5 flex-none";
    if (type.startsWith("ECOPOINTS_")) return <LeafIcon className={className} />;
    if (type === "NEW_MATCHING_REQUEST") return <MapPinIcon className={className} />;
    if (type.startsWith("REQUEST_COLLECTED_") || type.startsWith("REQUEST_DELIVERED_")) return <TruckIcon className={className} />;
    return <BellIcon className={className} />;
}

export default function NotificationsPage() {
    const queryClient = useQueryClient();
    const { data, isPending, isError, error, refetch, isFetching } = useNotifications();
    // Older pages stay here, so a refetch of the first page keeps them
    const [older, setOlder] = useState<Notification[]>([]);
    const [lastSize, setLastSize] = useState<number | null>(null);
    const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications });

    const more = useMutation({
        mutationFn: (before: string) => api.get<{ notifications: Notification[] }>(`/api/notifications?before=${encodeURIComponent(before)}`),
        onSuccess: page => {
            setOlder(current => [...current, ...page.notifications]);
            setLastSize(page.notifications.length);
        },
    });
    const readAll = useMutation({
        mutationFn: () => api.post("/api/notifications/read-all"),
        onSuccess: () => setOlder(current => current.map(item => ({ ...item, isRead: true }))),
        onSettled: invalidate,
    });

    const seen = new Set<string>();
    const rows = data ? [...data.notifications, ...older].filter(item => !seen.has(item.notificationId) && seen.add(item.notificationId)) : [];
    const hasMore = (lastSize ?? data?.notifications.length ?? 0) >= PAGE_SIZE;

    // The page opens at once and the read mark follows, so a slow request never delays the click
    function markRead(item: Notification) {
        if (item.isRead) return;
        api.patch(`/api/notifications/${encodeURIComponent(item.notificationId)}/read`)
            .then(() => setOlder(current => current.map(other => other.notificationId === item.notificationId ? { ...other, isRead: true } : other)))
            .catch(() => { /* Opening the page matters more than the read mark */ })
            .finally(() => void invalidate());
    }

    // Only our own pages, never another site
    const ownPage = (url: string) => url.startsWith("/") && !url.startsWith("//") ? url : "/notifications";

    return (
        <main className="p-4 sm:p-8">
            <div className="mx-auto max-w-5xl space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                        <h1 className={pageTitle}>Notifications</h1>
                        {data && <p role="status" className="font-semibold text-text-muted">{data.unreadCount} unread</p>}
                    </div>
                    {data && <Button variant="secondary" onClick={() => readAll.mutate()} disabled={data.unreadCount === 0}
                        busy={readAll.isPending} busyLabel="Marking...">Mark all read</Button>}
                </div>
                {readAll.isError && <Alert variant="error">We could not mark them as read. Please try again.</Alert>}
                {isPending && <Spinner label="Loading notifications..." />}
                {isError && <QueryError message={isAuthError(error) ? "Please log in to see your notifications." : "We could not load your notifications. Please try again."} onRetry={() => refetch()} busy={isFetching} />}
                {data && rows.length === 0 && <EmptyState title="No notifications yet.">You will see updates about your requests and pickups here.</EmptyState>}
                {rows.length > 0 && <ul className="divide-y divide-border rounded-2xl border border-border bg-surface-elevated shadow-rest">
                    {rows.map(item => <li key={item.notificationId} className="first:rounded-t-2xl last:rounded-b-2xl">
                        <Link href={ownPage(item.url)} onClick={() => markRead(item)}
                            className={`flex min-h-11 w-full min-w-0 items-start gap-3 rounded-[inherit] border-l-4 p-4 text-left focus-visible:relative focus-visible:z-10 ${item.isRead ? "border-l-transparent text-text-muted hover:bg-surface" : "border-l-accent bg-accent-100 hover:bg-accent-200"}`}>
                            {typeIcon(item.type)}
                            <span className="min-w-0 flex-1">
                                {!item.isRead && <span className="sr-only">Unread: </span>}
                                <span className={`block break-words ${item.isRead ? "" : "font-bold text-text"}`}>{item.title}</span>
                                <span className={`block break-words ${item.isRead ? "" : "text-text-muted"}`}>{item.body}</span>
                                <time dateTime={item.createdAt} className="block text-caption text-text-muted">{formatTimestamp(item.createdAt)}</time>
                            </span>
                        </Link>
                    </li>)}
                </ul>}
                {more.isError && <Alert variant="error">We could not load older notifications. Please try again.</Alert>}
                {data && rows.length > 0 && hasMore && <div className="flex justify-center">
                    <Button variant="secondary" busy={more.isPending} busyLabel="Loading..."
                        onClick={() => more.mutate(rows[rows.length - 1].createdAt)}>Load more</Button>
                </div>}
            </div>
        </main>
    );
}

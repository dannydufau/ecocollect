"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isAuthError } from "@/lib/api";
import { fetchMyRequests } from "@/lib/my-requests";
import { queryKeys } from "@/lib/query-keys";
import { formatTimestamp } from "@/lib/time";
import type { RequestStatus } from "@/lib/types";
import { Alert, Button, CalendarIcon, CameraIcon, ClockIcon, EmptyState, FilterTabs, LoadingRegion, PackageIcon, QueryError, ScaleIcon, StatusBadge, clickableCard, linkButton, pageTitle, stretchedLink } from "@/components/ui";

const statuses: RequestStatus[] = ["Open", "Assigned", "Collected", "Delivered", "Cancelled", "Expired", "Missed"];
const detail = "inline-flex items-center gap-1.5";

function readStatus(value: string | null): RequestStatus | undefined {
    return statuses.find(s => s === value);
}

export default function MyRequests() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [created, duplicate] = searchParams.getAll("created");
    const initialCount = Number(created);
    const validCreated = duplicate === undefined && initialCount > 0 && Number.isSafeInteger(initialCount) && String(initialCount) === created ? initialCount : null;
    const [createdBanner, setCreatedBanner] = useState<number | null>(validCreated);
    const paramKey = searchParams.toString();
    const urlStatus = readStatus(searchParams.get("status"));
    const [pendingStatus, setPendingStatus] = useState<{ from: string; value: RequestStatus | undefined } | null>(null);
    const status = pendingStatus && pendingStatus.from === paramKey ? pendingStatus.value : urlStatus;

    // Strip ?created=N once read so reloading the page does not repeat the creation banner.
    useEffect(() => {
        if (!searchParams.has("created")) return;
        const next = new URLSearchParams(searchParams.toString());
        next.delete("created");
        const query = next.toString();
        router.replace(query ? `/resident?${query}` : "/resident", { scroll: false });
    }, [router, searchParams]);

    function setStatus(next: RequestStatus | undefined) {
        setPendingStatus({ from: paramKey, value: next });
        const params = new URLSearchParams(paramKey);
        params.delete("created");
        if (next) params.set("status", next);
        else params.delete("status");
        const query = params.toString();
        router.replace(query ? `/resident?${query}` : "/resident", { scroll: false });
    }

    const { data, isPending, isError, isPlaceholderData, error, refetch, isFetching } = useQuery({
        queryKey: [...queryKeys.myRequests, status ?? "All"],
        queryFn: () => fetchMyRequests(status),
        // Keep the old rows on screen while a new filter loads, so the list does not jump
        placeholderData: keepPreviousData,
    });
    return (
        <section aria-labelledby="my-requests-heading" className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 id="my-requests-heading" className={pageTitle}>My requests</h1>
                <Link href="/resident/requests/new" className={linkButton}>New request</Link>
            </div>
            {createdBanner !== null && <Alert variant="success" onDismiss={() => setCreatedBanner(null)}>
                {createdBanner === 1 ? "Your request was created." : `${createdBanner} requests were created.`}
            </Alert>}
            <FilterTabs label="Filter requests by status" options={["All", ...statuses]} value={status ?? "All"}
                onChange={option => setStatus(option === "All" ? undefined : option)} />
            {isPending && <LoadingRegion label="Loading your requests..." />}
            {isError && <QueryError message={isAuthError(error) ? "You are not allowed to see this list. Please log in again as a resident." : "We could not load your requests. Please try again."} onRetry={() => refetch()} busy={isFetching} />}
            {!isPlaceholderData && data?.length === 0 && (status
                ? <EmptyState icon={<PackageIcon />} title={`You have no ${status.toLowerCase()} requests.`}
                    action={<Button variant="secondary" onClick={() => setStatus(undefined)}>Show all requests</Button>} />
                : <EmptyState icon={<PackageIcon />} title="You have no requests yet."
                    action={<Link href="/resident/requests/new" className={linkButton}>Create your first request</Link>} />)}
            {data && data.length > 0 && <>
            <ul aria-busy={isPlaceholderData} className={`space-y-3 transition-opacity ${isPlaceholderData ? "opacity-60" : ""}`}>
                {data.map(request => {
                    const closed = request.status === "Cancelled" || request.status === "Expired";
                    return <li key={request.requestId} className={`${clickableCard} ${closed ? "border-dashed" : ""}`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <Link href={`/resident/requests/${encodeURIComponent(request.requestId)}`} className={stretchedLink}>
                                {request.quantity} × {request.category.name}
                            </Link>
                            <StatusBadge status={request.status} />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-muted">
                            <span className={detail}><ScaleIcon className="size-4 flex-none" /><span className="tabular-nums">{request.estimatedWeightKg.toFixed(2)} kg</span></span>
                            <span className={detail}><ClockIcon className="size-4 flex-none" /><span>Created <time dateTime={request.createdAt}>{formatTimestamp(request.createdAt)}</time></span></span>
                            {request.hasPhoto && <span className={detail}><CameraIcon className="size-4 flex-none" />Has photo</span>}
                            {request.status === "Open" && <span className={`${detail} font-semibold`}><CalendarIcon className="size-4 flex-none" /><span>Expires <time dateTime={request.expiresAt}>{formatTimestamp(request.expiresAt)}</time></span></span>}
                        </div>
                    </li>;
                })}
            </ul>
            <p className="text-caption text-text-muted">Times are Calgary time.</p>
            </>}
        </section>
    );
}

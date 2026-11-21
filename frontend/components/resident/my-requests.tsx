"use client";

import Link from "next/link";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isAuthError } from "@/lib/api";
import { fetchMyRequests } from "@/lib/my-requests";
import { queryKeys } from "@/lib/query-keys";
import { formatTimestamp } from "@/lib/time";
import type { RequestStatus } from "@/lib/types";
import { Alert, FilterTabs, QueryError, Spinner, StatusBadge, clickableCard, linkButton, pageTitle, stretchedLink } from "@/components/ui";

const statuses: RequestStatus[] = ["Open", "Assigned", "Collected", "Delivered", "Cancelled", "Expired", "Missed"];

export default function MyRequests({ created }: { created?: string }) {
    const [status, setStatus] = useState<RequestStatus>();
    const { data, isPending, isError, isPlaceholderData, error, refetch, isFetching } = useQuery({
        queryKey: [...queryKeys.myRequests, status ?? "All"],
        queryFn: () => fetchMyRequests(status),
        // Keep the old rows on screen while a new filter loads, so the list does not jump
        placeholderData: keepPreviousData,
    });
    const count = created && /^[1-9]\d*$/.test(created) ? Number(created) : 0;

    return (
        <section aria-labelledby="my-requests-heading" className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 id="my-requests-heading" className={pageTitle}>My requests</h1>
                <Link href="/resident/requests/new" className={linkButton}>New request</Link>
            </div>
            {Number.isSafeInteger(count) && count > 0 && <Alert variant="success">{count === 1 ? "Your request was created." : `${count} requests were created.`}</Alert>}
            <FilterTabs label="Filter requests by status" options={["All", ...statuses]} value={status ?? "All"}
                onChange={option => setStatus(option === "All" ? undefined : option)} />
            {isPending && <Spinner label="Loading your requests..." />}
            {isError && <QueryError message={isAuthError(error) ? "You are not allowed to see this list. Please log in again as a resident." : "We could not load your requests. Please try again."} onRetry={() => refetch()} busy={isFetching} />}
            {!isPlaceholderData && data?.length === 0 && (status
                ? <p>You have no {status.toLowerCase()} requests.</p>
                : <div className="flex flex-col items-start gap-3 py-6">
                    <h2 className="text-2xl">You have no requests yet.</h2>
                    <Link href="/resident/requests/new" className={linkButton}>Create your first request</Link>
                </div>)}
            {data && data.length > 0 && <>
            <ul className="space-y-3">
                {data.map(request => <li key={request.requestId} className={clickableCard}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                                                <Link href={`/resident/requests/${encodeURIComponent(request.requestId)}`} className={stretchedLink}>
                            {request.quantity} × {request.category.name}
                        </Link>
                        <StatusBadge status={request.status} />
                    </div>
                    <p className="mt-2 text-neutral-800">
                        {request.estimatedWeightKg.toFixed(2)} kg · Created <time dateTime={request.createdAt}>{formatTimestamp(request.createdAt)}</time>
                        {request.hasPhoto && " · Has photo"}
                    </p>
                    {request.status === "Open" && <p className="mt-1 text-neutral-700">Expires <time dateTime={request.expiresAt}>{formatTimestamp(request.expiresAt)}</time></p>}
                </li>)}
            </ul>
            <p className="text-[13px] text-text-muted">Times are Calgary time.</p>
            </>}
        </section>
    );
}

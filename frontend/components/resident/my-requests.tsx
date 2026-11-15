"use client";

import Link from "next/link";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isAuthError } from "@/lib/api";
import { fetchMyRequests } from "@/lib/my-requests";
import { queryKeys } from "@/lib/query-keys";
import { formatTimestamp } from "@/lib/time";
import type { RequestStatus } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/status-badge";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";

const statuses: RequestStatus[] = ["Open", "Assigned", "Collected", "Delivered", "Cancelled", "Expired", "Missed"];
const linkStyle = "inline-flex min-h-11 items-center rounded-lg bg-[#9e5220] px-4 text-white focus-visible:outline-2 focus-visible:outline-offset-2";

export default function MyRequests({ created }: { created?: string }) {
    const [status, setStatus] = useState<RequestStatus>();
    const { data, isPending, isError, error, refetch, isFetching } = useQuery({
        queryKey: [...queryKeys.myRequests, status ?? "All"],
        queryFn: () => fetchMyRequests(status),
        placeholderData: keepPreviousData,
    });
    const count = created && /^[1-9]\d*$/.test(created) ? Number(created) : 0;

    return (
        <section aria-labelledby="my-requests-heading" className="min-w-0 space-y-4">
            {Number.isSafeInteger(count) && count > 0 && <Alert variant="success">{count === 1 ? "Your request was created." : `${count} requests were created.`}</Alert>}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 id="my-requests-heading" className="text-2xl font-semibold">My requests</h1>
                <Link href="/resident/requests/new" className={linkStyle}>New request</Link>
            </div>
            <div role="group" aria-label="Filter requests by status" className="flex flex-wrap gap-2">
                {([undefined, ...statuses] as const).map(filter => (
                    <button key={filter ?? "All"} type="button" aria-pressed={status === filter} onClick={() => setStatus(filter)}
                        className={`min-h-11 rounded-full border px-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 ${status === filter ? "border-stone-800 bg-stone-800 text-white" : "border-stone-400 bg-white text-stone-900"}`}>
                        {filter ?? "All"}
                    </button>
                ))}
            </div>
            <button type="button" onClick={() => refetch()} disabled={isFetching}
                className="min-h-11 rounded border border-stone-400 px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">
                {isFetching ? "Refreshing..." : "Refresh"}
            </button>
            {isPending && <Spinner label="Loading your requests..." />}
            {isError && <Alert variant="error">{isAuthError(error) ? "You are not allowed to see this list. Please log in again as a resident." : "We could not load your requests. Please try again."}</Alert>}
            {!isPending && !isError && data?.length === 0 && <EmptyState title={status ? `You have no ${status.toLowerCase()} requests.` : "You have not made any requests yet."} />}
            {data && data.length > 0 && <ul className="space-y-3">
                {data.map(request => <li key={request.requestId} className="min-w-0 rounded-lg border border-stone-300 bg-white p-4 text-stone-900">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <Link href={`/resident/requests/${encodeURIComponent(request.requestId)}`} className="min-w-0 break-words text-lg font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">
                            {request.category.name}
                        </Link>
                        <StatusBadge status={request.status} />
                    </div>
                    <p className="mt-2">Quantity: {request.quantity} · Estimated weight: {request.estimatedWeightKg.toFixed(2)} kg</p>
                    <p className="mt-1 text-sm">Created <time dateTime={request.createdAt}>{formatTimestamp(request.createdAt)}</time> (Calgary time)</p>
                    {request.hasPhoto && <p className="mt-1 text-sm">Has photo</p>}
                </li>)}
            </ul>}
        </section>
    );
}

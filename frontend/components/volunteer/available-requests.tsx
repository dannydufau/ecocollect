"use client";

import Link from "next/link";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { formatPostalCode } from "@/lib/postal-code";
import { formatTimestamp, formatWindow, friendlyWindow } from "@/lib/time";
import type { AvailableRequest } from "@/lib/types";
import { useProfile } from "@/lib/use-profile";
import { Button, EmptyState, MapPinIcon, QueryError, Spinner, clickableCard, mono, pageTitle, stretchedLink, textLink } from "@/components/ui";
import PostalFilter from "./postal-filter";

export default function AvailableRequests() {
    const profile = useProfile();
    // Null until the profile has loaded or failed, then the preferred codes are taken once (README 16.9)
    const [codes, setCodes] = useState<string[] | null>(null);
    if (codes === null && (profile.data || profile.isError)) setCodes(profile.data?.preferredPostalCodes ?? []);
    const { data, isPending, isError, isPlaceholderData, refetch, isFetching } = useQuery({
        queryKey: [...queryKeys.availableRequests, codes],
        queryFn: () => api.get<AvailableRequest[]>(`/api/requests?view=available${codes?.length ? `&postalCodes=${encodeURIComponent(codes.join(","))}` : ""}`),
        enabled: codes !== null,
        // Keep the old rows on screen while a new filter loads
        placeholderData: keepPreviousData,
    });
    const empty = !isPlaceholderData && data?.length === 0;

    return (
        <section aria-labelledby="available-heading" className="min-w-0 space-y-4">
            <h1 id="available-heading" className={pageTitle}>Available requests</h1>
            {codes && <PostalFilter codes={codes} onChange={setCodes} showAll={!empty} />}
            {!empty && codes?.length === 0 && profile.data?.preferredPostalCodes.length === 0 && <p className="text-text-muted">
                Save preferred postal codes in your <Link href="/profile" className={textLink}>profile</Link> to see nearby requests first.
            </p>}
            {isPending && <Spinner label="Loading requests..." />}
            {isError && <QueryError message="We could not load the requests. Please try again." onRetry={() => void refetch()} busy={isFetching} />}
            {empty && (codes?.length
                ? <EmptyState title="No open requests in these areas." action={<Button variant="secondary" onClick={() => setCodes([])}>Show all areas</Button>} />
                : <EmptyState title="No open requests right now.">
                    New requests appear here on their own. You can set your <Link href="/profile" className={textLink}>preferred postal codes in Profile</Link>.
                </EmptyState>)}
            {data && data.length > 0 && <>
                <p role="status" className="font-semibold">{data.length === 1 ? "1 request" : `${data.length} requests`}</p>
                <ul aria-busy={isPlaceholderData} className={`grid gap-3 transition-opacity md:grid-cols-2 ${isPlaceholderData ? "opacity-60" : ""}`}>
                    {data.map(request => <li key={request.requestId} className={clickableCard}>
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                                                        <Link href={`/volunteer/requests/${encodeURIComponent(request.requestId)}`} className={stretchedLink}>
                                {request.quantity} × {request.category.name}
                            </Link>
                            <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-neutral-100 px-3 py-1 text-text-muted ${mono}`}><MapPinIcon className="size-4" />{formatPostalCode(request.postalCode)}</span>
                        </div>
                        <p className="mt-1 text-text-muted">{request.estimatedWeightKg.toFixed(2)} kg{request.hasPhoto && " · Photo"}</p>
                        <ul className="mt-1">
                            {request.windows.map(window => <li key={window.windowId} className="mb-1 flex flex-wrap items-baseline gap-x-2">
                                <strong>{friendlyWindow(window)}</strong>
                                <span className="text-caption text-text-muted">{formatWindow(window)}</span>
                            </li>)}
                        </ul>
                        <p className="mt-1 text-small text-text-muted">Open until {formatTimestamp(request.expiresAt)}</p>
                    </li>)}
                </ul>
                <p className="text-caption text-text-muted">Times are Calgary time.</p>
            </>}
        </section>
    );
}

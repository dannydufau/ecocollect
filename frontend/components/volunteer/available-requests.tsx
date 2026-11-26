"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { formatPostalCode } from "@/lib/postal-code";
import { formatTimestamp, formatWindow, friendlyWindow } from "@/lib/time";
import type { AvailableRequest } from "@/lib/types";
import { useProfile } from "@/lib/use-profile";
import { Button, EmptyState, LoadingRegion, MapPinIcon, PackageIcon, QueryError, clickableCard, identifier, pageTitle, stretchedLink, textLink } from "@/components/ui";
import PostalFilter from "./postal-filter";

function readPostalCodes(searchParams: URLSearchParams): string[] | null {
    if (!searchParams.has("postalCodes")) return null;
    const raw = searchParams.get("postalCodes") ?? "";
    return raw ? raw.split(",").map(code => code.trim()).filter(Boolean) : [];
}

export default function AvailableRequests() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const profile = useProfile();
    // Null until URL params or profile has loaded/failed, then the preferred codes are taken once (README 16.9)
    const [codes, setCodesState] = useState<string[] | null>(() => readPostalCodes(searchParams));
    if (codes === null && (profile.data || profile.isError)) setCodesState(profile.data?.preferredPostalCodes ?? []);

    function setCodes(next: string[]) {
        setCodesState(next);
        const params = new URLSearchParams(searchParams.toString());
        params.set("postalCodes", next.join(","));
        router.replace(`/volunteer?${params.toString()}`, { scroll: false });
    }
    const { data, isPending, isError, isPlaceholderData, refetch, isFetching } = useQuery({
        queryKey: [...queryKeys.availableRequests, codes],
        queryFn: () => api.get<AvailableRequest[]>(`/api/requests?view=available${codes?.length ? `&postalCodes=${encodeURIComponent(codes.join(","))}` : ""}`),
        enabled: codes !== null,
        // Keep the old rows on screen while a new filter loads
        placeholderData: keepPreviousData,
    });
    const empty = !isPlaceholderData && data?.length === 0;

    const waiting = codes === null || isPending;

    return (
        <section aria-labelledby="available-heading" className="min-w-0 space-y-4">
            <h1 id="available-heading" className={pageTitle}>Available requests</h1>
            {!waiting && codes && <PostalFilter codes={codes} onChange={setCodes} showAll={!empty} />}
            {!waiting && !empty && codes?.length === 0 && profile.data?.preferredPostalCodes.length === 0 && <p className="text-text-muted">
                Save preferred postal codes in your <Link href="/profile" className={textLink}>profile</Link> to see nearby requests first.
            </p>}
            {waiting && <LoadingRegion label="Loading requests..." />}
            {isError && <QueryError message="We could not load the requests. Please try again." onRetry={() => void refetch()} busy={isFetching} />}
            {empty && (codes?.length
                ? <EmptyState icon={<PackageIcon />} title="No open requests in these areas." action={<Button variant="secondary" onClick={() => setCodes([])}>Show all areas</Button>} />
                : <EmptyState icon={<PackageIcon />} title="No open requests right now.">
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
                            <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-surface px-3 py-1 text-text-muted ${identifier}`}><MapPinIcon className="size-4" />{formatPostalCode(request.postalCode)}</span>
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

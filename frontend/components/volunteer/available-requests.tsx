"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { formatPostalCode } from "@/lib/postal-code";
import { formatTimestamp, formatWindow, friendlyWindow } from "@/lib/time";
import type { AvailableRequest } from "@/lib/types";
import { Alert, Button, EmptyState, Spinner, card, textLink } from "@/components/ui";

// FE-047 adds the postal code filter that fills this
const codes: string[] = [];

export default function AvailableRequests() {
    const { data, isPending, isError, refetch, isFetching } = useQuery({
        queryKey: [...queryKeys.availableRequests, codes],
        queryFn: () => api.get<AvailableRequest[]>(`/api/requests?view=available${codes.length ? `&postalCodes=${encodeURIComponent(codes.join(","))}` : ""}`),
    });

    return (
        <section aria-labelledby="available-heading" className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 id="available-heading" className="text-[length:clamp(30px,5vw,40px)]">Available requests</h1>
                <Link href="/volunteer/history" className={textLink}>History</Link>
            </div>
            {isPending && <Spinner label="Loading requests..." />}
            {isError && <>
                <Alert variant="error">We could not load the requests. Please try again.</Alert>
                <div><Button variant="secondary" onClick={() => void refetch()} busy={isFetching} busyLabel="Trying...">Try again</Button></div>
            </>}
            {data?.length === 0 && <EmptyState title="Nothing available right now" />}
            {data && data.length > 0 && <>
                <p role="status" className="font-semibold">{data.length === 1 ? "1 request" : `${data.length} requests`}</p>
                <ul className="space-y-3">
                    {data.map(request => <li key={request.requestId} className={`${card} relative min-w-0 hover:shadow-[0_3px_10px_rgba(46,43,37,0.16)] has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-accent`}>
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                            {/* The empty ::after stretches the link over the whole card so it is easy to tap */}
                            <Link href={`/volunteer/requests/${encodeURIComponent(request.requestId)}`} className="min-w-0 break-words font-[family-name:var(--font-heading)] text-[21px] text-text no-underline after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] focus-visible:outline-none">
                                {request.quantity} × {request.category.name}
                            </Link>
                            <span className="whitespace-nowrap rounded-full bg-neutral-100 px-3 py-1 text-[13px] font-semibold text-neutral-800">{formatPostalCode(request.postalCode)}</span>
                        </div>
                        <p className="mt-1 text-neutral-800">{request.estimatedWeightKg.toFixed(2)} kg{request.hasPhoto && " · Photo"}</p>
                        <ul className="mt-1">
                            {request.windows.map(window => <li key={window.windowId} className="mb-1">
                                <strong>{friendlyWindow(window)}</strong><br />
                                <span className="text-[13px] text-neutral-700">{formatWindow(window)}</span>
                            </li>)}
                        </ul>
                        <p className="mt-1 text-[14px] text-neutral-700">Open until {formatTimestamp(request.expiresAt)}</p>
                    </li>)}
                </ul>
                <p className="text-[13px] text-neutral-700">Times are Calgary time.</p>
            </>}
        </section>
    );
}

"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { friendlyWindow } from "@/lib/time";
import type { AvailableRequest } from "@/lib/types";
import { Alert, EmptyState, Spinner, card, textLink } from "@/components/ui";

// FE-047 adds the postal code filter that fills this
const codes: string[] = [];

export default function AvailableRequests() {
    const { data, isPending, isError } = useQuery({
        queryKey: [...queryKeys.availableRequests, codes],
        queryFn: () => api.get<AvailableRequest[]>(`/api/requests?view=available${codes.length ? `&postalCodes=${encodeURIComponent(codes.join(","))}` : ""}`),
    });

    return (
        <section aria-labelledby="available-heading" className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="available-heading" className="text-[length:clamp(26px,4vw,32px)]">Available requests</h2>
                <Link href="/volunteer/history" className={textLink}>History</Link>
            </div>
            {isPending && <Spinner label="Loading requests..." />}
            {isError && <Alert variant="error">We could not load the requests. Please try again.</Alert>}
            {data?.length === 0 && <EmptyState title="Nothing available right now" />}
            {data && data.length > 0 && <>
                <ul className="space-y-3">
                    {data.map(request => <li key={request.requestId} className={`${card} relative min-w-0 hover:shadow-[0_3px_10px_rgba(46,43,37,0.16)] has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-accent`}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            {/* The empty ::after stretches the link over the whole card so it is easy to tap */}
                            <Link href={`/volunteer/requests/${encodeURIComponent(request.requestId)}`} className="min-w-0 break-words font-[family-name:var(--font-heading)] text-[21px] text-text no-underline after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] focus-visible:outline-none">
                                {request.quantity} × {request.category.name}
                            </Link>
                            {request.hasPhoto && <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm text-neutral-800">Photo</span>}
                        </div>
                        <p className="mt-2 text-neutral-800">{request.estimatedWeightKg.toFixed(2)} kg · {request.postalCode}</p>
                        <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
                            {request.windows.map(window => <li key={window.windowId}>{friendlyWindow(window)}</li>)}
                        </ul>
                    </li>)}
                </ul>
                <p className="text-[13px] text-neutral-700">Times are Calgary time.</p>
            </>}
        </section>
    );
}

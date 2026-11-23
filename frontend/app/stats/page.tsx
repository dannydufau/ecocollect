"use client";

import { useQuery } from "@tanstack/react-query";
import { EmptyState, QueryError, LoadingRegion, pageTitle } from "@/components/ui";
import { ApiError } from "@/lib/api";
import type { operations } from "@/lib/api-types";
import { usePublicStream } from "@/lib/public-stream";
import { queryKeys } from "@/lib/query-keys";
import { formatTimestamp } from "@/lib/time";

type Stats = operations["getPublicStats"]["responses"][200]["content"]["application/json"];

const cell = "px-1.5 py-3 first:pl-4 last:pr-4 sm:px-4";

// Public route, so a plain fetch without the Authorization header that api.get adds
async function getStats(): Promise<Stats> {
    const res = await fetch("/api/public/stats");
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
    return res.json();
}

export default function StatsPage() {
    const { data, isPending, isError, refetch, isFetching } = useQuery({ queryKey: queryKeys.publicStats, queryFn: getStats });
    usePublicStream({ stats: true }, () => void refetch());

    return (
        <main className="p-4 sm:p-8">
            <div className="mx-auto max-w-5xl space-y-6">
                <h1 className={pageTitle}>Community impact</h1>
                {isPending && <LoadingRegion label="Loading stats..." />}
                {isError && <QueryError message="We could not load the stats. Check your connection and try again." onRetry={() => refetch()} busy={isFetching} />}
                {data && <>
                    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {[
                            { label: "Deliveries", value: String(data.deliveries) },
                            { label: "Items delivered", value: String(data.itemsDelivered) },
                            { label: "Estimated weight (kg)", value: data.estimatedWeightKgDelivered.toFixed(2) },
                            { label: "EcoPoints awarded", value: data.ecopointsAwarded.toFixed(2) },
                        ].map(({ label, value }) => (
                            <div key={label} className="flex min-w-0 flex-col justify-between gap-1 rounded-2xl border border-border bg-surface-elevated p-3 shadow-rest sm:p-5">
                                <dt className="text-sm text-text-muted">{label}</dt>
                                {/* A very long number scrolls inside its card, the digits never split */}
                                <dd className="overflow-x-auto whitespace-nowrap text-[clamp(20px,6.2vw,36px)] font-bold leading-tight tabular-nums">{value}</dd>
                            </div>
                        ))}
                    </dl>
                    <section className="overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-rest" aria-labelledby="waste-types">
                        <h2 id="waste-types" className="p-4">By waste type</h2>
                        {!data.byWasteType.length ? <EmptyState bare title="No deliveries yet." /> : (
                            <div className="overflow-x-auto"><table className="w-full text-left text-small">
                                <caption className="sr-only">Deliveries by waste type</caption>
                                <thead className="bg-surface text-text-muted">
                                    <tr><th scope="col" className={cell}>Waste type</th><th scope="col" className={`${cell} text-right`}>Deliveries</th><th scope="col" className={`${cell} text-right`}>Items</th><th scope="col" className={`${cell} text-right`}>Estimated kg</th></tr>
                                </thead>
                                <tbody>
                                    {data.byWasteType.map(row => <tr key={row.wasteType} className="border-t border-border">
                                        <th scope="row" className={`${cell} break-words font-semibold`}>{row.wasteType}</th>
                                        <td className={`${cell} text-right tabular-nums`}>{row.deliveries}</td>
                                        <td className={`${cell} text-right tabular-nums`}>{row.itemsDelivered}</td>
                                        <td className={`${cell} text-right tabular-nums`}>{row.estimatedWeightKgDelivered.toFixed(2)}</td>
                                    </tr>)}
                                </tbody>
                            </table></div>
                        )}
                    </section>
                    <p className="text-caption text-text-muted">Updated <time dateTime={data.updatedAt}>{formatTimestamp(data.updatedAt)}</time></p>
                </>}
            </div>
        </main>
    );
}

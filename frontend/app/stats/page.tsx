"use client";

import { useQuery } from "@tanstack/react-query";
import { Alert, Button, EmptyState, Spinner, card, pageTitle } from "@/components/ui";
import { ApiError } from "@/lib/api";
import type { operations } from "@/lib/api-types";
import { usePublicStream } from "@/lib/public-stream";
import { queryKeys } from "@/lib/query-keys";
import { formatTimestamp } from "@/lib/time";

type Stats = operations["getPublicStats"]["responses"][200]["content"]["application/json"];

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
            <div className="mx-auto max-w-3xl space-y-6">
                <h1 className={pageTitle}>Community impact</h1>
                {isPending && <Spinner label="Loading stats..." />}
                {isError && <div className="space-y-2">
                    <Alert variant="error">We could not load the stats. Check your connection and try again.</Alert>
                    <Button variant="secondary" onClick={() => refetch()} disabled={isFetching}>Try again</Button>
                </div>}
                {data && <>
                    <dl className="grid gap-3 sm:grid-cols-2">
                        {[
                            { label: "Deliveries", value: String(data.deliveries) },
                            { label: "Items delivered", value: String(data.itemsDelivered) },
                            { label: "Estimated weight (kg)", value: data.estimatedWeightKgDelivered.toFixed(2) },
                            { label: "EcoPoints awarded", value: data.ecopointsAwarded.toFixed(2) },
                        ].map(({ label, value }) => (
                            <div key={label} className={`${card} min-w-0`}>
                                <dt className="text-neutral-700">{label}</dt>
                                <dd className="mt-1 whitespace-nowrap text-[40px] font-bold leading-none tabular-nums">{value}</dd>
                            </div>
                        ))}
                    </dl>
                    <section className="space-y-3" aria-labelledby="waste-types">
                        <h2 id="waste-types" className="text-2xl">By waste type</h2>
                        {!data.byWasteType.length ? <EmptyState title="No deliveries yet." /> : (
                            <div className="overflow-x-auto"><table className="w-full text-left text-[15px]">
                                <caption className="sr-only">Deliveries by waste type</caption>
                                <thead className="text-neutral-700">
                                    <tr><th scope="col" className="py-2 pr-2">Waste type</th><th scope="col" className="py-2 pr-2 text-right">Deliveries</th><th scope="col" className="py-2 pr-2 text-right">Items</th><th scope="col" className="py-2 text-right">Estimated kg</th></tr>
                                </thead>
                                <tbody>
                                    {data.byWasteType.map(row => <tr key={row.wasteType} className="border-t border-divider">
                                        <th scope="row" className="break-words py-2 pr-2 font-semibold">{row.wasteType}</th>
                                        <td className="py-2 pr-2 text-right tabular-nums">{row.deliveries}</td>
                                        <td className="py-2 pr-2 text-right tabular-nums">{row.itemsDelivered}</td>
                                        <td className="py-2 text-right tabular-nums">{row.estimatedWeightKgDelivered.toFixed(2)}</td>
                                    </tr>)}
                                </tbody>
                            </table></div>
                        )}
                    </section>
                    <p className="text-[13px] text-text-muted">Updated <time dateTime={data.updatedAt}>{formatTimestamp(data.updatedAt)}</time></p>
                </>}
            </div>
        </main>
    );
}

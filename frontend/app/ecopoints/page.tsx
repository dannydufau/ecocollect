"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Alert, EmptyState, Spinner } from "@/components/ui";
import { api, isAuthError } from "@/lib/api";
import type { operations } from "@/lib/api-types";
import { queryKeys } from "@/lib/query-keys";
import { formatTimestamp } from "@/lib/time";

type EcoPoints = operations["getMyEcopoints"]["responses"][200]["content"]["application/json"];

function formulaText(award: EcoPoints["awards"][number]): string {
    if (award.kind === "CANCELLATION") return "Late cancellation by the resident";
    if (award.earnedAs === "resident") return `Half of ${(award.points * 2).toFixed(2)}`;
    return `3 × ${award.quantity} items + 4 × ${award.estimatedWeightKg?.toFixed(2)} kg`;
}

export default function EcoPointsPage() {
    const { data, isPending, isError, error, refetch, isFetching } = useQuery({
        queryKey: queryKeys.ecopoints,
        queryFn: () => api.get<EcoPoints>("/api/ecopoints"),
    });

    return (
        <main className="min-h-screen bg-stone-50 p-4 text-stone-900 sm:p-8">
            <div className="mx-auto max-w-3xl space-y-6">
                <h1 className="text-3xl font-semibold">EcoPoints</h1>
                {isPending && <Spinner label="Loading EcoPoints..." />}
                {isError && <div className="space-y-2">
                    <Alert variant="error">
                        {isAuthError(error) ? "Please log in to view your EcoPoints." : "We could not load this page. Check your connection and try again."}
                    </Alert>
                    <button type="button" onClick={() => refetch()} disabled={isFetching}
                        className="min-h-11 rounded-lg border border-stone-400 px-4 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">
                        Try again
                    </button>
                </div>}
                {data && <>
                    <dl className="grid gap-3 sm:grid-cols-3">
                        {[
                            { label: "Total", points: data.total },
                            { label: "As resident", points: data.asResident },
                            { label: "As volunteer", points: data.asVolunteer },
                        ].map(({ label, points }) => (
                            <div key={label} className="min-w-0 rounded-xl border border-stone-200 bg-white p-4">
                                <dt className="text-sm text-stone-700">{label}</dt>
                                <dd className="mt-1 break-all text-3xl font-semibold tabular-nums">{points.toFixed(2)}</dd>
                            </div>
                        ))}
                    </dl>
                    <p className="text-stone-800">Volunteers earn 3 points per item plus 4 per kg. Residents earn half of that when their request is delivered.</p>
                    <section className="space-y-3" aria-labelledby="award-history">
                        <h2 id="award-history" className="text-xl font-semibold">Your awards</h2>
                        {!data.awards.length ? <EmptyState title="No EcoPoints yet.">Points are awarded when a pickup is delivered.</EmptyState> : (
                            <ul className="space-y-3">
                                {data.awards.map(award => (
                                    <li key={award.awardId} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-stone-200 bg-white p-4">
                                        <p className="min-w-24 text-2xl font-semibold tabular-nums">+{award.points.toFixed(2)}</p>
                                        <div className="min-w-0 flex-1 basis-60">
                                            <p><strong>{award.kind === "DELIVERY" ? "Delivery" : "Cancellation"}</strong> as {award.earnedAs}</p>
                                            <p className="break-words">
                                                {award.categoryName ? `${award.quantity} × ${award.categoryName}, ${award.estimatedWeightKg?.toFixed(2)} kg` : "—"}
                                            </p>
                                            <p className="text-sm text-stone-700">{formulaText(award)} · <time dateTime={award.awardedAt}>{formatTimestamp(award.awardedAt)}</time></p>
                                        </div>
                                        {award.kind === "DELIVERY" && <Link
                                            href={`/${award.earnedAs}/requests/${award.requestId}`}
                                            className="inline-flex min-h-11 items-center rounded text-[#8c491a] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2">
                                            View request
                                        </Link>}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </>}
            </div>
        </main>
    );
}

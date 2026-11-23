"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, QueryError, Spinner, card, pageTitle, panel, textLink } from "@/components/ui";
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
        <main className="p-4 sm:p-8">
            <div className="mx-auto max-w-5xl space-y-6">
                <h1 className={pageTitle}>EcoPoints</h1>
                {isPending && <Spinner label="Loading EcoPoints..." />}
                {isError && <QueryError message={isAuthError(error) ? "Please log in to view your EcoPoints." : "We could not load this page. Check your connection and try again."} onRetry={() => refetch()} busy={isFetching} />}
                {data && <>
                    <dl className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
                        {[
                            { label: "Total", points: data.total },
                            { label: "As resident", points: data.asResident, dot: "bg-accent-700" },
                            { label: "As volunteer", points: data.asVolunteer, dot: "bg-accent-2-800" },
                        ].map(({ label, points, dot }) => (
                            <div key={label} className={`min-w-0 ${label === "Total" ? `${panel} border-transparent bg-accent-2-800 text-on-moss` : card}`}>
                                <dt className={`flex items-center gap-2 ${label === "Total" ? "" : "text-text-muted"}`}>
                                    {dot && <span aria-hidden="true" className={`size-2.5 rounded-full ${dot}`} />}{label}
                                </dt>
                                {/* A very long number scrolls inside its card, the digits never split */}
                                <dd className="mt-1 overflow-x-auto whitespace-nowrap text-4xl font-bold leading-tight tabular-nums">{points.toFixed(2)}</dd>
                            </div>
                        ))}
                    </dl>
                    <p className="text-text-muted">Volunteers earn 3 points per item plus 4 per kg. Residents earn half of that when their request is delivered.</p>
                    <section className="space-y-3" aria-labelledby="award-history">
                        <h2 id="award-history" className="text-2xl">Your awards</h2>
                        {!data.awards.length ? <EmptyState title="No EcoPoints yet.">Points are awarded when a pickup is delivered.</EmptyState> : (
                            <ul className="divide-y divide-border rounded-2xl border border-border bg-surface-elevated shadow-rest">
                                {data.awards.map(award => (
                                    <li key={award.awardId} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 p-4">
                                        <p className="min-w-24 whitespace-nowrap text-2xl font-bold tabular-nums text-accent-2-800">+{award.points.toFixed(2)}</p>
                                        <div className="min-w-0 flex-1 basis-60">
                                            <p className="flex flex-wrap items-center gap-x-2">
                                                <strong>{award.kind === "DELIVERY" ? "Delivery" : "Cancellation"}</strong>{" "}
                                                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${award.earnedAs === "resident" ? "bg-accent-700 text-on-accent" : "bg-accent-2-800 text-on-moss"}`}>as {award.earnedAs}</span>
                                            </p>
                                            {award.kind === "DELIVERY" && award.categoryName
                                                ? <p className="break-words">{award.quantity} × {award.categoryName}, <span className="tabular-nums">{award.estimatedWeightKg?.toFixed(2)} kg</span></p>
                                                : <p className="text-text-muted">Item details are not shown for this award.</p>}
                                            <p className="text-[13px] text-text-muted">{formulaText(award)} · <time dateTime={award.awardedAt}>{formatTimestamp(award.awardedAt)}</time></p>
                                        </div>
                                        {award.kind === "DELIVERY" && <Link
                                            href={`/${award.earnedAs}/requests/${award.requestId}`}
                                            className={textLink}>
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

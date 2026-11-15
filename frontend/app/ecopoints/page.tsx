"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Alert, EmptyState, Spinner } from "@/components/ui";
import { api, isAuthError } from "@/lib/api";
import type { operations } from "@/lib/api-types";
import { queryKeys } from "@/lib/query-keys";
import { formatTimestamp } from "@/lib/time";

type EcoPoints = operations["getMyEcopoints"]["responses"][200]["content"]["application/json"];

const formulas = {
    VOLUNTEER: "3 × quantity + 4 × estimated weight (kg)",
    RESIDENT: "(3 × quantity + 4 × estimated weight (kg)) ÷ 2",
};

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
                        {isAuthError(error) ? "Please log in to view your EcoPoints." : "Could not load your EcoPoints. Please try again."}
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
                    <section className="space-y-3" aria-labelledby="award-history">
                        <h2 id="award-history" className="text-xl font-semibold">Award history</h2>
                        {!data.awards.length ? <EmptyState title="No awards yet" /> : (
                            <ul className="space-y-3">
                                {data.awards.map(award => (
                                    <li key={award.awardId} className="min-w-0 rounded-xl border border-stone-200 bg-white p-4">
                                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                                            <h3 className="font-semibold">{award.kind === "DELIVERY" ? "Delivery" : "Cancellation"}</h3>
                                            <p className="break-all font-semibold tabular-nums">{award.points.toFixed(2)} points</p>
                                        </div>
                                        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                                            <div><dt className="text-stone-600">Earned as</dt><dd>{award.earnedAs === "resident" ? "Resident" : "Volunteer"}</dd></div>
                                            <div><dt className="text-stone-600">Category</dt><dd className="break-words">{award.categoryName ?? "—"}</dd></div>
                                            <div><dt className="text-stone-600">Quantity</dt><dd>{award.quantity ?? "—"}</dd></div>
                                            <div><dt className="text-stone-600">Awarded</dt><dd><time dateTime={award.awardedAt}>{formatTimestamp(award.awardedAt)}</time></dd></div>
                                            <div className="sm:col-span-2"><dt className="text-stone-600">Formula</dt><dd>{formulas[award.formula]}</dd></div>
                                        </dl>
                                        {award.kind === "DELIVERY" && <Link
                                            href={`/${award.earnedAs}/requests/${award.requestId}`}
                                            className="mt-3 inline-flex min-h-11 items-center rounded text-[#8c491a] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2">
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

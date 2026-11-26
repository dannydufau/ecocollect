"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Alert, Button, EmptyState, FilterTabs, LoadingRegion, QueryError, StatusBadge, TruckIcon, card, clickableCard, identifier, linkButton, pageTitle, pageWidth, stretchedLink } from "@/components/ui";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { formatPostalCode } from "@/lib/postal-code";
import { formatTimestamp, formatWindow } from "@/lib/time";
import type { VolunteerAssignment } from "@/lib/types";

type AssignmentStatus = VolunteerAssignment["assignment"]["status"];

const labels = {
    Active: "Active", Collected: "Collected", Delivered: "Delivered",
    Volunteer_Cancelled: "Cancelled by me", Resident_Cancelled: "Cancelled by resident", Missed_Pickup: "Missed",
} as const satisfies Record<AssignmentStatus, string>;
const filters = ["All", ...Object.values(labels)];

function readFilter(status: string | null): string {
    return status && status in labels ? labels[status as AssignmentStatus] : "All";
}

function VolunteerHistoryContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const paramKey = searchParams.toString();
    const urlFilter = readFilter(searchParams.get("status"));
    const [pendingFilter, setPendingFilter] = useState<{ from: string; value: string } | null>(null);
    const filter = pendingFilter && pendingFilter.from === paramKey ? pendingFilter.value : urlFilter;
    const [cancelledBanner, setCancelledBanner] = useState(() => searchParams.get("cancelled") === "1");
    const bannerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (cancelledBanner) bannerRef.current?.focus();
    }, [cancelledBanner]);

    useEffect(() => {
        if (!searchParams.has("cancelled")) return;
        const next = new URLSearchParams(searchParams.toString());
        next.delete("cancelled");
        const query = next.toString();
        router.replace(query ? `/volunteer/history?${query}` : "/volunteer/history", { scroll: false });
    }, [router, searchParams]);

    function setFilter(next: string) {
        setPendingFilter({ from: paramKey, value: next });
        const key = (Object.keys(labels) as AssignmentStatus[]).find(status => labels[status] === next);
        const params = new URLSearchParams(paramKey);
        params.delete("cancelled");
        if (key) params.set("status", key);
        else params.delete("status");
        const query = params.toString();
        router.replace(query ? `/volunteer/history?${query}` : "/volunteer/history", { scroll: false });
    }

    const assignmentStatus = (Object.keys(labels) as AssignmentStatus[]).find(status => labels[status] === filter);
    const { data, isPending, isError, isPlaceholderData, refetch, isFetching } = useQuery({
        queryKey: [...queryKeys.volunteerRequests, filter],
        queryFn: () => api.get<VolunteerAssignment[]>(`/api/requests?view=volunteer${assignmentStatus ? `&assignmentStatus=${assignmentStatus}` : ""}`),
        // Keep the old rows on screen while a new filter loads
        placeholderData: keepPreviousData,
    });
    // Collected ones wait for a delivery, so they go first
    const rows = data && [...data].sort((a, b) => Number(b.assignment.status === "Collected") - Number(a.assignment.status === "Collected"));

    return (
        <main className={`${pageWidth} p-4 sm:p-8`}>
            <div className="space-y-6">
                <h1 className={pageTitle}>My assignments</h1>
                {cancelledBanner && <div ref={bannerRef} tabIndex={-1} className="outline-none">
                    <Alert variant="success" onDismiss={() => setCancelledBanner(false)}>Assignment cancelled.</Alert>
                </div>}
                <FilterTabs label="Assignment status" options={filters} value={filter} onChange={setFilter} />
                {isPending && <LoadingRegion label="Loading your assignments..." />}
                {isError && <QueryError message="We could not load your assignments. Please try again." onRetry={() => void refetch()} busy={isFetching} />}
                {!isPlaceholderData && rows?.length === 0 && (filter === "All"
                    ? <EmptyState icon={<TruckIcon />} title="No assignments yet." action={<Link href="/volunteer" className={linkButton}>Browse available requests</Link>}>
                        Accept a request to see it here.
                    </EmptyState>
                    : <EmptyState icon={<TruckIcon />} title={`No ${filter.toLowerCase()} assignments.`}
                        action={<Button variant="secondary" onClick={() => setFilter("All")}>Show all assignments</Button>} />)}
                {rows && rows.length > 0 && <ul aria-busy={isPlaceholderData} className={`space-y-3 transition-opacity ${isPlaceholderData ? "opacity-60" : ""}`}>
                    {rows.map(row => {
                        const waiting = row.assignment.status === "Collected";
                        return <li key={row.assignment.assignmentId} className={`${row.category ? clickableCard : `${card} border-dashed`} ${waiting ? "border-l-4 border-l-accent" : ""} min-w-0 space-y-1`}>
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                {row.category
                                    ? <Link href={`/volunteer/requests/${encodeURIComponent(row.requestId)}`} className={stretchedLink}>{row.quantity} × {row.category.name}</Link>
                                    : <p className="min-w-0 break-words text-lg font-semibold text-text-muted">Request no longer available to you</p>}
                                <StatusBadge status={labels[row.assignment.status]} />
                            </div>
                            {/* The whole card is the link, so this only looks like a button */}
                            {waiting && <p><span className={linkButton}>Record delivery</span></p>}
                            {row.estimatedWeightKg !== null && row.postalCode !== null && <p className="text-text-muted"><span className="tabular-nums">{row.estimatedWeightKg.toFixed(2)} kg</span> · <span className={identifier}>{formatPostalCode(row.postalCode)}</span></p>}
                            <p>{formatWindow(row.assignment.window)}</p>
                            <p className="text-caption text-text-muted">Accepted {formatTimestamp(row.assignment.acceptedAt)}</p>
                            {row.assignment.endedAt && <p className="text-caption text-text-muted">Ended {formatTimestamp(row.assignment.endedAt)}</p>}
                        </li>;
                    })}
                </ul>}
            </div>
        </main>
    );
}

export default function VolunteerHistoryPage() {
    return (
        <Suspense>
            <VolunteerHistoryContent />
        </Suspense>
    );
}

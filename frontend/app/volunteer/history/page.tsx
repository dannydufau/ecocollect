"use client";

import Link from "next/link";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Button, EmptyState, FilterTabs, LoadingRegion, QueryError, StatusBadge, TruckIcon, card, clickableCard, identifier, linkButton, pageTitle, pageWidth, stretchedLink } from "@/components/ui";
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

export default function VolunteerHistoryPage() {
    const [filter, setFilter] = useState("All");
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
                            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3">
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

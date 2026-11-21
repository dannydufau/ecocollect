"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, FilterTabs, QueryError, Spinner, StatusBadge, card, clickableCard, mono, pageTitle, stretchedLink } from "@/components/ui";
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
    const { data, isPending, isError, refetch, isFetching } = useQuery({
        queryKey: [...queryKeys.volunteerRequests, filter],
        queryFn: () => api.get<VolunteerAssignment[]>(`/api/requests?view=volunteer${assignmentStatus ? `&assignmentStatus=${assignmentStatus}` : ""}`),
    });
    // Collected ones wait for a delivery, so they go first
    const rows = data && [...data].sort((a, b) => Number(b.assignment.status === "Collected") - Number(a.assignment.status === "Collected"));

    return (
        <main className="p-4 sm:p-8">
            <div className="mx-auto max-w-3xl space-y-6">
                <h1 className={pageTitle}>My assignments</h1>
                <FilterTabs label="Assignment status" options={filters} value={filter} onChange={setFilter} />
                {isPending && <Spinner label="Loading your assignments..." />}
                {isError && <QueryError message="We could not load your assignments. Please try again." onRetry={() => void refetch()} busy={isFetching} />}
                {rows?.length === 0 && (filter === "All"
                    ? <EmptyState title="No assignments yet.">Accept a request to see it here.</EmptyState>
                    : <EmptyState title={`No ${filter.toLowerCase()} assignments.`} />)}
                {rows && rows.length > 0 && <ul className="space-y-3">
                    {rows.map(row => {
                        return <li key={row.assignment.assignmentId} className={`${row.category ? clickableCard : card} min-w-0 space-y-1`}>
                            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                                {row.category
                                    ? <Link href={`/volunteer/requests/${encodeURIComponent(row.requestId)}`} className={stretchedLink}>{row.quantity} × {row.category.name}</Link>
                                    : <p className="text-lg font-bold">Request no longer available to you</p>}
                                <StatusBadge status={labels[row.assignment.status]} />
                            </div>
                            {row.assignment.status === "Collected" && <p className="text-[13px] font-semibold text-accent-800">Record delivery</p>}
                            {row.estimatedWeightKg !== null && row.postalCode !== null && <p className="text-neutral-800"><span className="tabular-nums">{row.estimatedWeightKg.toFixed(2)} kg</span> · <span className={mono}>{formatPostalCode(row.postalCode)}</span></p>}
                            <p>{formatWindow(row.assignment.window)}</p>
                            <p className="text-[13px] text-text-muted">Accepted {formatTimestamp(row.assignment.acceptedAt)}</p>
                            {row.assignment.endedAt && <p className="text-[13px] text-text-muted">Ended {formatTimestamp(row.assignment.endedAt)}</p>}
                        </li>;
                    })}
                </ul>}
            </div>
        </main>
    );
}

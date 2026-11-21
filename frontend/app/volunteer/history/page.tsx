"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, EmptyState, FilterTabs, Spinner, clickableCard, card, mono, pageTitle, stretchedLink } from "@/components/ui";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { formatPostalCode } from "@/lib/postal-code";
import { formatTimestamp, formatWindow } from "@/lib/time";
import type { VolunteerAssignment } from "@/lib/types";

type AssignmentStatus = VolunteerAssignment["assignment"]["status"];

// Words and a symbol, so the status is not told by color alone
const statuses: Record<AssignmentStatus, { label: string; symbol: string; style: string }> = {
    Active: { label: "Active", symbol: "◐", style: "bg-accent-200 text-accent-900" },
    Collected: { label: "Collected", symbol: "◕", style: "bg-accent-2-700 text-on-moss" },
    Delivered: { label: "Delivered", symbol: "✓", style: "bg-accent-2-900 text-on-moss" },
    Volunteer_Cancelled: { label: "Cancelled by me", symbol: "✕", style: "bg-neutral-300 text-neutral-900" },
    Resident_Cancelled: { label: "Cancelled by resident", symbol: "✕", style: "bg-neutral-300 text-neutral-900" },
    Missed_Pickup: { label: "Missed", symbol: "!", style: "bg-danger text-white" },
};
const filters = ["All", ...Object.values(statuses).map(status => status.label)];

export default function VolunteerHistoryPage() {
    const [filter, setFilter] = useState("All");
    const assignmentStatus = (Object.keys(statuses) as AssignmentStatus[]).find(status => statuses[status].label === filter);
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
                {isError && <div className="space-y-2">
                    <Alert variant="error">We could not load your assignments. Please try again.</Alert>
                    <Button variant="secondary" onClick={() => void refetch()} busy={isFetching} busyLabel="Trying...">Try again</Button>
                </div>}
                {rows?.length === 0 && (filter === "All"
                    ? <EmptyState title="No assignments yet.">Accept a request to see it here.</EmptyState>
                    : <EmptyState title={`No ${filter.toLowerCase()} assignments.`} />)}
                {rows && rows.length > 0 && <ul className="space-y-3">
                    {rows.map(row => {
                        const status = statuses[row.assignment.status];
                        return <li key={row.assignment.assignmentId} className={`${row.category ? clickableCard : card} min-w-0 space-y-1`}>
                            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                                {row.category
                                    ? <Link href={`/volunteer/requests/${encodeURIComponent(row.requestId)}`} className={stretchedLink}>{row.quantity} × {row.category.name}</Link>
                                    : <p className="text-lg font-bold">Request no longer available to you</p>}
                                <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3.5 py-1 text-[13px] font-semibold ${status.style}`}>
                                    <span aria-hidden="true">{status.symbol}</span>{status.label}
                                </span>
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

"use client";

import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { fetchMyRequests } from "@/lib/my-requests";
import { queryKeys } from "@/lib/query-keys";
import { formatTimestamp } from "@/lib/time";

function errorMessage(error: unknown): string {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        return "You are not allowed to see this list. Please log in again as a resident.";
    }
    return "We could not load your requests. Please try again.";
}

export default function MyRequests() {
    const { data, isPending, isError, error, refetch, isFetching } = useQuery({
        queryKey: queryKeys.myRequests,
        queryFn: fetchMyRequests,
    });

    return (
        <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">My requests</h2>
                <button
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="rounded border px-3 py-1 text-sm disabled:opacity-50"
                >
                    {isFetching ? "Refreshing..." : "Refresh"}
                </button>
            </div>

            {isPending && <p>Loading your requests...</p>}

            {isError && (
                <p role="alert" className="rounded border border-red-500 p-3 text-red-500">
                    {errorMessage(error)}
                </p>
            )}

            {data && data.length === 0 && <p>You have not made any requests yet.</p>}

            {data && data.length > 0 && (
                <ul className="flex flex-col gap-3">
                    {data.map((r) => (
                        <li key={r.requestId} className="rounded border p-4">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-lg font-medium">
                                    {r.quantity} x {r.category}
                                </p>
                                <span className="rounded border px-2 py-0.5 text-xs">{r.status}</span>
                            </div>
                            <p className="mt-2 text-sm opacity-80">Created {formatTimestamp(r.createdAt)} (Calgary time)</p>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

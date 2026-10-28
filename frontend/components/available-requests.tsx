"use client";

import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { formatCalgary, formatWindow } from "@/lib/calgary-time";
import { availableRequestsKey, fetchAvailableRequests } from "@/lib/requests";

function errorMessage(error: unknown): string {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        return "You are not allowed to see this list. Please log in again as a volunteer.";
    }
    return "We could not load the requests. Please try again.";
}

export default function AvailableRequests() {
    const { data, isPending, isError, error, refetch, isFetching } = useQuery({
        queryKey: availableRequestsKey,
        queryFn: fetchAvailableRequests,
        retry: (count, err) =>
            !(err instanceof ApiError && (err.status === 401 || err.status === 403)) && count < 3,
    });

    return (
        <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Available requests</h2>
                {/* Temporary: remove this button once the SSE hook (#19) refreshes the list. */}
                <button
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="rounded border px-3 py-1 text-sm disabled:opacity-50"
                >
                    {isFetching ? "Refreshing..." : "Refresh"}
                </button>
            </div>

            {isPending && <p>Loading requests...</p>}

            {isError && (
                <p role="alert" className="rounded border border-red-500 p-3 text-red-500">
                    {errorMessage(error)}
                </p>
            )}

            {data && data.length === 0 && <p>No requests are available right now.</p>}

            {data && data.length > 0 && (
                <ul className="flex flex-col gap-3">
                    {data.map((r) => (
                        <li key={r.requestId} className="rounded border p-4">
                            <p className="text-lg font-medium">
                                {r.quantity} x {r.category}
                            </p>
                            <p className="text-sm opacity-80">
                                About {r.estimatedWeightKg} kg, area {r.postalCode}
                            </p>
                            <p className="mt-2 text-sm font-medium">Pickup times (Calgary)</p>
                            <ul className="list-inside list-disc text-sm">
                                {r.windows.map((w) => (
                                    <li key={`${w.date}-${w.startHour}`}>{formatWindow(w.date, w.startHour)}</li>
                                ))}
                            </ul>
                            <p className="mt-2 text-sm opacity-80">Expires {formatCalgary(r.expiresAt)}</p>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

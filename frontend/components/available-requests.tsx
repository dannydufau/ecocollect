"use client";

import { useQuery } from "@tanstack/react-query";
import { isAuthError } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { fetchAvailableRequests } from "@/lib/requests";
import { formatTimestamp, formatWindow } from "@/lib/time";

function errorMessage(error: unknown): string {
    if (isAuthError(error)) {
        return "You are not allowed to see this list. Please log in again as a volunteer.";
    }
    return "We could not load the requests. Please try again.";
}

export default function AvailableRequests() {
    const { data, isPending, isError, error, refetch, isFetching } = useQuery({
        queryKey: queryKeys.availableRequests,
        queryFn: fetchAvailableRequests,
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
                                    <li key={`${w.date}-${w.startHour}`}>{formatWindow(w)}</li>
                                ))}
                            </ul>
                            <p className="mt-2 text-sm opacity-80">Expires {formatTimestamp(r.expiresAt)}</p>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

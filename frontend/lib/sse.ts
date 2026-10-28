import type { QueryClient } from "@tanstack/react-query";
import type { SseSignal } from "@/lib/types";
import { queryKeys } from "@/lib/query-keys";

export function openSignalStream(queryClient: QueryClient): EventSource {
    const source = new EventSource("/api/events");

    source.addEventListener("signal", (event) => {
        let signal: SseSignal;
        try {
            signal = JSON.parse(event.data) as SseSignal;
        } catch (error) {
            console.warn("Ignoring a bad SSE signal", error);
            return;
        }

        if (signal.type === "REQUEST_CREATED") {
            queryClient.invalidateQueries({ queryKey: queryKeys.myRequests });
        } else if (signal.type === "NEW_MATCHING_REQUEST") {
            queryClient.invalidateQueries({
                queryKey: queryKeys.availableRequests,
            });
        }
    });

    source.onopen = () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.allRequests });
    };

    return source;
}
import { api } from "@/lib/api";

// Shapes follow contracts/openapi.yaml (MyRequest).
export type RequestStatus = "Open" | "Assigned" | "Collected" | "Delivered" | "Cancelled" | "Expired";

export type MyRequest = {
    requestId: string;
    category: string;
    quantity: number;
    estimatedWeightKg: number;
    status: RequestStatus;
    createdAt: string; // UTC timestamp ending in Z
    expiresAt: string; // UTC timestamp ending in Z
};

// The create-request form and the SSE hook refresh this list by invalidating this key.
export const myRequestsKey = ["requests", "mine"] as const;

// Newest first, as the API returns it.
export function fetchMyRequests(): Promise<MyRequest[]> {
    return api.get<MyRequest[]>("/api/requests?view=mine");
}

// A timestamp from the API is UTC. Show it in Calgary time.
// An invalid timestamp is returned unchanged instead of throwing.
export function formatCreated(timestamp: string): string {
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) {
        return timestamp;
    }
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Edmonton",
        dateStyle: "medium",
        timeStyle: "short",
    }).format(parsed);
}

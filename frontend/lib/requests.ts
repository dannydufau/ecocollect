import { api } from "@/lib/api";

// Shapes follow contracts/openapi.yaml (AvailableRequest). There is no street address in them.
export type PickupWindow = {
    date: string; // Calgary calendar date, e.g. "2026-10-30"
    startHour: number; // 14 means 14:00 to 15:00 Calgary time
};

export type AvailableRequest = {
    requestId: string;
    category: string;
    quantity: number;
    estimatedWeightKg: number;
    postalCode: string;
    windows: PickupWindow[];
    expiresAt: string; // UTC timestamp ending in Z
};

// Other screens (and the SSE hook later) refresh this list by invalidating this key.
export const availableRequestsKey = ["requests", "available"] as const;

// No postalCodes filter for Oct 28: every available request is returned.
export function fetchAvailableRequests(): Promise<AvailableRequest[]> {
    return api.get<AvailableRequest[]>("/api/requests?view=available");
}

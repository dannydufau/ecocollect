import { api } from "@/lib/api";
import type { AvailableRequest } from "@/lib/types";

// No postalCodes filter for Oct 28: every available request is returned.
export function fetchAvailableRequests(): Promise<AvailableRequest[]> {
    return api.get<AvailableRequest[]>("/api/requests?view=available");
}

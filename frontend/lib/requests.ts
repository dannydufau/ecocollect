import { api } from "@/lib/api";
import type { OldAvailableRequest } from "@/lib/types";

// No postalCodes filter for Oct 28: every available request is returned.
export function fetchAvailableRequests(): Promise<OldAvailableRequest[]> {
    return api.get<OldAvailableRequest[]>("/api/requests?view=available");
}

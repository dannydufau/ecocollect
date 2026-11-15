import { api } from "@/lib/api";
import type { OldMyRequest } from "@/lib/types";

// Newest first, as the API returns it.
export function fetchMyRequests(): Promise<OldMyRequest[]> {
    return api.get<OldMyRequest[]>("/api/requests?view=mine");
}

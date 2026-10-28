import { api } from "@/lib/api";
import type { MyRequest } from "@/lib/types";

// Newest first, as the API returns it.
export function fetchMyRequests(): Promise<MyRequest[]> {
    return api.get<MyRequest[]>("/api/requests?view=mine");
}

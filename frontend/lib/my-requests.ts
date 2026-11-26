import { api } from "@/lib/api";
import type { MyRequest, RequestStatus } from "@/lib/types";

export function fetchMyRequests(status?: RequestStatus): Promise<MyRequest[]> {
    return api.get<MyRequest[]>(`/api/requests?view=mine${status ? `&status=${encodeURIComponent(status)}` : ""}`);
}

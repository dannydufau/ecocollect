import type { QueryKey } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";

// README 16.3: which cached lists a notification makes stale.
export function keysFor(type: string, requestId: string | null): QueryKey[] {
    const keys: QueryKey[] = [queryKeys.notifications];
    // Check ECOPOINTS_ first, those types also end in _RESIDENT or _VOLUNTEER but are not about a request
    if (type.startsWith("ECOPOINTS_")) {
        keys.push(queryKeys.ecopoints);
        return keys;
    }
    const detail = requestId ? [queryKeys.request(requestId)] : [];
    if (type === "REQUEST_CREATED" || type.endsWith("_RESIDENT")) keys.push(queryKeys.myRequests, ...detail);
    else if (type === "NEW_MATCHING_REQUEST") keys.push(queryKeys.availableRequests);
    else if (type.endsWith("_VOLUNTEER")) keys.push(queryKeys.volunteerRequests, ...detail);
    return keys;
}

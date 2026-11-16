import type { QueryKey } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";

// The types of README 13.1. A type outside this list only refreshes the bell, even if its name ends like a known one.
const known = new Set([
    "REQUEST_CREATED",
    "NEW_MATCHING_REQUEST",
    "REQUEST_UPDATED_RESIDENT",
    "REQUEST_ASSIGNED_RESIDENT",
    "REQUEST_ASSIGNED_VOLUNTEER",
    "REQUEST_COLLECTED_RESIDENT",
    "REQUEST_COLLECTED_VOLUNTEER",
    "REQUEST_DELIVERED_RESIDENT",
    "REQUEST_DELIVERED_VOLUNTEER",
    "ASSIGNMENT_CANCELLED_BY_RESIDENT_RESIDENT",
    "ASSIGNMENT_CANCELLED_BY_RESIDENT_VOLUNTEER",
    "ASSIGNMENT_CANCELLED_BY_VOLUNTEER_RESIDENT",
    "ASSIGNMENT_CANCELLED_BY_VOLUNTEER_VOLUNTEER",
    "ASSIGNMENT_MISSED_RESIDENT",
    "ASSIGNMENT_MISSED_VOLUNTEER",
    "REQUEST_CANCELLED_RESIDENT",
    "REQUEST_EXPIRED_RESIDENT",
    "ECOPOINTS_AWARDED_ON_DELIVERY_RESIDENT",
    "ECOPOINTS_AWARDED_ON_DELIVERY_VOLUNTEER",
    "ECOPOINTS_AWARDED_ON_ASSIGNMENT_CANCELLATION_VOLUNTEER",
]);

// README 16.3: which cached lists a notification makes stale.
export function keysFor(type: string, requestId: string | null): QueryKey[] {
    const keys: QueryKey[] = [queryKeys.notifications];
    if (!known.has(type)) return keys;
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

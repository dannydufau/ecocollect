import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { Notification } from "@/lib/types";

// N3, first page only. The bell and the notifications page share this query.
export function useNotifications() {
    return useQuery({
        queryKey: queryKeys.notifications,
        queryFn: () => api.get<{ unreadCount: number; notifications: Notification[] }>("/api/notifications"),
    });
}

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { Profile } from "@/lib/types";

export function useProfile() {
    return useQuery({ queryKey: queryKeys.profile, queryFn: () => api.get<Profile>("/api/profile") });
}

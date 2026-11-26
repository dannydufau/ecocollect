import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { Profile, ProfileEdit } from "@/lib/types";
import { useLockedMutation } from "@/lib/use-locked-mutation";

// U7 answers with the full profile, so it goes straight into the cache
export function useSaveProfile() {
    const queryClient = useQueryClient();
    return useLockedMutation({
        mutationFn: (body: ProfileEdit) => api.patch<Profile>("/api/profile", body),
        onSuccess: (profile) => queryClient.setQueryData(queryKeys.profile, profile),
    });
}

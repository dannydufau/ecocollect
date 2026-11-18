import type { QueryClient } from "@tanstack/react-query";

// The cached lists don't say whose they are, so a different person signing in must not see the last person's.
// The first sign-in of a tab (nobody before) is skipped: clearing then would cancel a request an unguarded page
// like /ecopoints already started, and it would never finish.
export function dropCacheIfUserChanged(queryClient: QueryClient, previousUid: string | null, uid: string | null): void {
    if (previousUid !== null && previousUid !== uid) {
        queryClient.clear();
    }
}

import type { QueryClient } from "@tanstack/react-query";

// The lists are cached in the browser tab, under keys that don't say whose they are.
// So when the signed-in person changes (or nobody is signed in any more), the old person's lists must go.
export function dropCacheIfUserChanged(queryClient: QueryClient, previousUid: string | null, uid: string | null): void {
    if (previousUid !== uid) {
        queryClient.clear();
    }
}

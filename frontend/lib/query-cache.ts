import type { QueryClient } from "@tanstack/react-query";

// The lists are cached in the browser tab, under keys that don't say whose they are.
// So when the signed-in person changes (or nobody is signed in any more), the old person's lists must go.
// Nobody before means the first sign-in of this tab: there is nothing of anyone's to drop, and clearing then would cut
// off the request an unguarded page like /ecopoints already started, which then waits forever.
export function dropCacheIfUserChanged(queryClient: QueryClient, previousUid: string | null, uid: string | null): void {
    if (previousUid !== null && previousUid !== uid) {
        queryClient.clear();
    }
}

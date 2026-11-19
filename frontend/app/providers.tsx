"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { isClientError } from "@/lib/api";
import { AuthProvider } from "@/lib/auth-context";
import { StreamContext, useEventStream } from "@/lib/sse";

function EventStream({ children }: { children: ReactNode }) {
  const { reopen } = useEventStream();
  return <StreamContext.Provider value={reopen}>{children}</StreamContext.Provider>;
}

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // A request the server called wrong won't fix itself by asking again, so every list shows it right away.
            retry: (count, err) => !isClientError(err) && count < 3,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <EventStream>{children}</EventStream>
      </AuthProvider>
    </QueryClientProvider>
  );
}

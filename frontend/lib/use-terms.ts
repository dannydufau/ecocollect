import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

// The current terms (U5). Works signed out.
export function useTerms() {
    return useQuery({
        queryKey: queryKeys.terms,
        queryFn: () => api.get<{ termsDocumentId: string; content: string; publishedAt: string }>("/api/terms"),
    });
}

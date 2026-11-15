import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

// The current terms (U5). Works signed out.
export function useTerms() {
    return useQuery({
        queryKey: ["terms"],
        queryFn: () => api.get<{ termsDocumentId: string; content: string; publishedAt: string }>("/api/terms"),
    });
}

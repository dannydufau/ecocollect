import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { TermsDocument } from "@/lib/types";

export function useTerms() {
    return useQuery({
        queryKey: queryKeys.terms,
        queryFn: () => api.get<TermsDocument>("/api/terms"),
    });
}

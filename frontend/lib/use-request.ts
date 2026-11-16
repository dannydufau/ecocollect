"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { api, ApiError, friendlyError } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { RequestDetail } from "@/lib/types";

const MAX_TIMER_DELAY = 2147483647;

export function useRequestDetail(id: string) {
    const client = useQueryClient();
    const query = useQuery({
        queryKey: queryKeys.request(id),
        queryFn: () => api.getWithMeta<RequestDetail>(`/api/requests/${encodeURIComponent(id)}`),
    });

    useEffect(() => {
        const response = query.data;
        if (!response?.data.refreshAt) return;
        const delay = Date.parse(response.data.refreshAt) - response.serverDate.getTime();
        if (!Number.isFinite(delay)) return;
        let timer: ReturnType<typeof setTimeout>;
        function schedule(remaining: number) {
            const step = Math.min(remaining, MAX_TIMER_DELAY);
            timer = setTimeout(() => {
                if (remaining > step) schedule(remaining - step);
                else void client.invalidateQueries({ queryKey: queryKeys.request(id) });
            }, step);
        }
        schedule(Math.max(5000, delay));
        return () => clearTimeout(timer);
    }, [client, id, query.data, query.dataUpdatedAt]);

    return {
        ...query,
        data: query.data?.data,
        unavailable: query.error instanceof ApiError && query.error.status === 404 && query.error.code === "request_unavailable",
    };
}

export function useRequestAction<TBody = void>(id: string, call: (body: TBody) => Promise<unknown>, alsoInvalidate: readonly QueryKey[] = []) {
    const client = useQueryClient();
    async function invalidate() {
        await Promise.all([queryKeys.request(id), ...alsoInvalidate].map(queryKey => client.invalidateQueries({ queryKey })));
    }
    const mutation = useMutation({
        mutationFn: call,
        onSuccess: invalidate,
        onError: async error => {
            // 404 too: a cancelled assignment answers 404 request_unavailable, so the page should refetch and show that
            if (error instanceof ApiError && (error.status === 409 || error.status === 404)) await invalidate();
        },
    });

    return {
        run: mutation.mutate,
        isPending: mutation.isPending,
        error: mutation.error,
        message: mutation.error ? friendlyError(mutation.error) : null,
    };
}

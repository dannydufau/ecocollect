"use client";

import { useRef } from "react";
import { useMutation, type UseMutationOptions, type UseMutationResult } from "@tanstack/react-query";

// Synchronous ref guard so two clicks before React re-renders only send one request.
export function useLockedMutation<TData = unknown, TError = Error, TVariables = void, TContext = unknown>(
    options: UseMutationOptions<TData, TError, TVariables, TContext>,
): UseMutationResult<TData, TError, TVariables, TContext> {
    const busy = useRef(false);
    const mutation = useMutation({
        ...options,
        onSettled: (data, error, variables, onMutateResult, context) => {
            busy.current = false;
            return options.onSettled?.(data, error, variables, onMutateResult, context);
        },
    });

    const mutate: typeof mutation.mutate = (...args) => {
        if (busy.current) return;
        busy.current = true;
        mutation.mutate(...args);
    };

    const mutateAsync: typeof mutation.mutateAsync = (...args) => {
        if (busy.current) return Promise.reject(new Error("Mutation already in progress"));
        busy.current = true;
        return mutation.mutateAsync(...args);
    };

    return { ...mutation, mutate, mutateAsync };
}

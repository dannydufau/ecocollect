"use client";

import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { QueryError, select } from "@/components/ui";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

type Category = {
    categoryId: string;
    name: string;
    wasteType: string;
    standardWeightKg: number;
};

export function useCategories() {
    return useQuery({
        queryKey: queryKeys.categories,
        queryFn: () => api.get<Category[]>("/api/categories"),
        staleTime: 60 * 60 * 1000,
    });
}

export function CategoryPicker({ value, onChange, disabledIds = [], invalid = false }: {
    value: string;
    onChange: (categoryId: string) => void;
    disabledIds?: string[];
    invalid?: boolean;
}) {
    const id = useId();
    const { data, isPending, isError, refetch, isFetching } = useCategories();

    if (isPending) return <p role="status">Loading categories...</p>;
    if (isError) return (
        <QueryError message="Could not load categories. Please try again." onRetry={() => refetch()} busy={isFetching} />
    );

    return (
        <div className="min-w-0">
            <label htmlFor={id} className="mb-1 block font-semibold">Category</label>
            <select id={id} value={value} onChange={event => onChange(event.target.value)}
                disabled={data.length === 0} aria-invalid={invalid}
                className={`${select} min-w-0`}>
                <option value="" disabled>{data.length ? "Choose a category" : "No categories available"}</option>
                {data.map(category => (
                    <option key={category.categoryId} value={category.categoryId}
                        disabled={disabledIds.includes(category.categoryId)}
                        className="disabled:text-text-muted">
                        {category.name}
                    </option>
                ))}
            </select>
        </div>
    );
}

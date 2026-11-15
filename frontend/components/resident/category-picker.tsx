"use client";

import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
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
    const { data, isPending, isError, refetch } = useCategories();

    if (isPending) return <p role="status">Loading categories...</p>;
    if (isError) return (
        <div>
            <p role="alert">Could not load categories. Please try again.</p>
            <button type="button" onClick={() => refetch()}
                className="min-h-11 rounded-lg border px-3 focus-visible:outline-2 focus-visible:outline-offset-2">
                Try again
            </button>
        </div>
    );

    return (
        <div className="min-w-0">
            <label htmlFor={id} className="mb-1 block text-sm font-medium">Category</label>
            <select id={id} value={value} onChange={event => onChange(event.target.value)}
                disabled={data.length === 0} aria-invalid={invalid}
                className="min-h-11 w-full min-w-0 rounded-lg border border-stone-400 bg-white px-3 text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">
                <option value="" disabled>{data.length ? "Choose a category" : "No categories available"}</option>
                {data.map(category => (
                    <option key={category.categoryId} value={category.categoryId}
                        disabled={disabledIds.includes(category.categoryId)}
                        className="disabled:text-stone-400">
                        {category.name}
                    </option>
                ))}
            </select>
        </div>
    );
}

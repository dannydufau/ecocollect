"use client";

import { useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, QueryError, input, select } from "@/components/ui";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export type Category = {
    categoryId: string;
    name: string;
    wasteType: string;
    standardWeightKg: number;
};

// Optional everyday search terms keyed by categoryId. /api/categories supplies
// the actual options; categories with no entry here remain searchable by name
// and wasteType. See frontend/README.md#category-catalogue-maintenance.
const CATEGORY_ALIASES: Record<string, readonly string[]> = {
    laptops: ["notebook", "macbook", "chromebook", "pc", "computer"],
    desktops: ["tower", "pc", "workstation", "computer"],
    monitors: ["screen", "display", "lcd"],
    tvs: ["television", "smart tv", "flat screen"],
    phones: ["cell phone", "cellphone", "smartphone", "mobile", "iphone", "android"],
    tablets: ["ipad", "e-reader", "kindle"],
    printers: ["inkjet", "laser", "all-in-one"],
    "small-appliances": ["toaster", "blender", "microwave", "kettle", "coffee maker", "vacuum"],
    "cables-chargers": ["cord", "power brick", "adapter", "usb", "hdmi", "wire"],
};

function matchesCategory(category: Category, query: string): boolean {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return true;
    const aliases = CATEGORY_ALIASES[category.categoryId] ?? [];
    const haystack = [category.name, category.wasteType, ...aliases].join(" ").toLowerCase();
    return terms.every((term) => haystack.includes(term));
}

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
    const searchId = `${id}-search`;
    const searchRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState("");
    const { data, isPending, isError, refetch, isFetching } = useCategories();

    if (isPending) return <p role="status">Loading categories...</p>;
    if (isError) return (
        <QueryError message="Could not load categories. Please try again." onRetry={() => refetch()} busy={isFetching} />
    );

    const trimmed = query.trim();
    const matches = data.filter((category) => matchesCategory(category, trimmed));
    // Keep the currently selected option in the select even if the search text no longer matches it.
    const selectedCategory = value ? data.find((category) => category.categoryId === value) : undefined;
    const options = selectedCategory && !matches.some((c) => c.categoryId === selectedCategory.categoryId)
        ? [selectedCategory, ...matches]
        : matches;

    function clearSearch() {
        setQuery("");
        searchRef.current?.focus();
    }

    return (
        <div className="min-w-0 space-y-2">
            {data.length > 0 && (
                <div>
                    <label htmlFor={searchId} className="mb-1 block text-small font-medium text-text-muted">
                        Search categories
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            ref={searchRef}
                            id={searchId}
                            type="text"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") event.preventDefault();
                            }}
                            placeholder="For example: cell phone, monitor, cable"
                            autoComplete="off"
                            className={`${input} min-w-0`}
                        />
                        {trimmed && (
                            <Button variant="secondary" size="sm" onClick={clearSearch} className="shrink-0">
                                Clear
                            </Button>
                        )}
                    </div>
                </div>
            )}

            <div>
                <label htmlFor={id} className="mb-1 block font-semibold">Category</label>
                <select id={id} value={value} onChange={event => onChange(event.target.value)}
                    disabled={data.length === 0} aria-invalid={invalid}
                    className={`${select} min-w-0`}>
                    <option value="" disabled>{data.length ? "Choose a category" : "No categories available"}</option>
                    {options.map(category => (
                        <option key={category.categoryId} value={category.categoryId}
                            disabled={disabledIds.includes(category.categoryId)}
                            className="disabled:text-text-muted">
                            {category.name}
                        </option>
                    ))}
                </select>
            </div>

            {trimmed && matches.length === 0 && (
                <div role="status" className="flex flex-wrap items-center gap-2 text-small text-text-muted">
                    <span>No categories match “{trimmed}”.</span>
                    <Button variant="secondary" size="sm" onClick={clearSearch}>
                        Clear search
                    </Button>
                </div>
            )}
        </div>
    );
}

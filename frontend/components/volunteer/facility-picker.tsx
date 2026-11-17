"use client";

import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { Facility } from "@/lib/types";

export function FacilityPicker({ categoryId, value, onChange }: {
    categoryId: string;
    value: string | null;
    onChange: (facilityId: string) => void;
}) {
    const name = useId();
    const { data, isPending, isError } = useQuery({
        queryKey: queryKeys.facilities(categoryId),
        queryFn: () => api.get<Facility[]>(`/api/facilities?categoryId=${encodeURIComponent(categoryId)}`),
    });

    if (isPending) return <Spinner label="Loading facilities..." />;
    if (isError) return <Alert variant="error">We could not load the facilities. Please try again.</Alert>;

    return (
        <fieldset className="min-w-0 space-y-2">
            <legend className="mb-1 font-semibold">Facility</legend>
            {data.length === 0 && <p>No facility accepts this category</p>}
            {data.map(facility => (
                <label key={facility.facilityId} className="flex min-h-11 min-w-0 cursor-pointer items-start gap-3 rounded-2xl border border-neutral-600 p-3 has-[:checked]:border-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2">
                    <input type="radio" name={name} value={facility.facilityId} checked={value === facility.facilityId}
                        onChange={() => onChange(facility.facilityId)} className="mt-1 h-5 w-5 flex-none accent-accent" />
                    <span className="min-w-0 break-words">
                        <span className="block font-semibold">{facility.name}</span>
                        <span className="block text-neutral-800">{facility.street}, {facility.postalCode}</span>
                        {facility.specialInstructions && <span className="block text-sm text-neutral-700">{facility.specialInstructions}</span>}
                    </span>
                </label>
            ))}
        </fieldset>
    );
}

"use client";

import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckIcon, MapPinIcon, QueryError, Spinner, identifier } from "@/components/ui";
import { api } from "@/lib/api";
import { formatPostalCode } from "@/lib/postal-code";
import { queryKeys } from "@/lib/query-keys";
import type { Facility } from "@/lib/types";

export function FacilityPicker({ categoryId, value, onChange }: {
    categoryId: string;
    value: string | null;
    onChange: (facilityId: string) => void;
}) {
    const name = useId();
    const { data, isPending, isError, refetch, isFetching } = useQuery({
        queryKey: queryKeys.facilities(categoryId),
        queryFn: () => api.get<Facility[]>(`/api/facilities?categoryId=${encodeURIComponent(categoryId)}`),
    });

    if (isPending) return <Spinner label="Loading facilities..." />;
    if (isError) return (
        <QueryError message="We could not load the facilities. Please try again." onRetry={() => void refetch()} busy={isFetching} />
    );

    return (
        <fieldset className="min-w-0 space-y-2">
            <legend className="mb-1 text-small font-semibold">Facility</legend>
            {data.length === 0 && <p>No facility accepts this category right now.</p>}
            {data.map(facility => (
                <label key={facility.facilityId} className={`flex min-h-11 min-w-0 cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-2.5 ${value === facility.facilityId ? "border-accent-2-700 bg-accent-2-200 ring-1 ring-accent-2-700" : "border-border-strong bg-white"}`}>
                    <input type="radio" name={name} value={facility.facilityId} checked={value === facility.facilityId}
                        onChange={() => onChange(facility.facilityId)} className="mt-1 h-5 w-5 flex-none accent-accent" />
                    <span className="min-w-0 flex-1 break-words">
                        <span className="block font-semibold">{facility.name}</span>
                        <span className="flex items-start gap-1"><MapPinIcon className="mt-0.5 size-4 flex-none" /><span>{facility.street}, Calgary <span className={identifier}>{formatPostalCode(facility.postalCode)}</span></span></span>
                        {facility.specialInstructions && <span className="mt-1 block rounded-lg bg-surface px-2.5 py-1.5 text-caption text-text-muted">{facility.specialInstructions}</span>}
                    </span>
                    {value === facility.facilityId && <CheckIcon className="size-5 flex-none text-accent-2-800" />}
                </label>
            ))}
        </fieldset>
    );
}

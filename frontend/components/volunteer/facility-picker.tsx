"use client";

import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Spinner, mono } from "@/components/ui";
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
        <div className="space-y-2">
            <Alert variant="error">We could not load the facilities. Please try again.</Alert>
            <Button variant="secondary" onClick={() => void refetch()} busy={isFetching} busyLabel="Trying...">Try again</Button>
        </div>
    );

    return (
        <fieldset className="min-w-0 space-y-2">
            <legend className="mb-1 text-[14px] font-semibold">Facility</legend>
            {data.length === 0 && <p>No facility accepts this category right now.</p>}
            {data.map(facility => (
                <label key={facility.facilityId} className={`flex min-h-11 min-w-0 cursor-pointer items-start gap-3 rounded-2xl px-3.5 py-2.5 ${value === facility.facilityId ? "bg-accent-2-200" : "bg-surface"}`}>
                    <input type="radio" name={name} value={facility.facilityId} checked={value === facility.facilityId}
                        onChange={() => onChange(facility.facilityId)} className="mt-1 h-5 w-5 flex-none accent-accent" />
                    <span className="min-w-0 break-words">
                        <span className="block font-semibold">{facility.name}</span>
                        <span className="block">{facility.street}, Calgary <span className={mono}>{formatPostalCode(facility.postalCode)}</span></span>
                        {facility.specialInstructions && <span className="block text-[13px] text-neutral-800">{facility.specialInstructions}</span>}
                    </span>
                </label>
            ))}
        </fieldset>
    );
}

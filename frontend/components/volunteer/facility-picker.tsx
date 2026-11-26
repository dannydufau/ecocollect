"use client";

import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChoiceCard, MapPinIcon, QueryError, Spinner, identifier } from "@/components/ui";
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
                <ChoiceCard key={facility.facilityId} name={name} value={facility.facilityId} tone="volunteer"
                    title={facility.name} checked={value === facility.facilityId} onChange={onChange}
                    detail={<span className="flex items-start gap-1"><MapPinIcon className="mt-0.5 size-4 flex-none" /><span>{facility.street}, Calgary <span className={identifier}>{formatPostalCode(facility.postalCode)}</span></span></span>}
                    note={facility.specialInstructions} />
            ))}
        </fieldset>
    );
}

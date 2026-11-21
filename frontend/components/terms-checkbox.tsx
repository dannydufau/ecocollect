"use client";

import { useEffect } from "react";
import { QueryError, Spinner } from "@/components/ui";
import { useTerms } from "@/lib/use-terms";

type Props = {
    value: string | null;
    onChange: (termsDocumentId: string | null) => void;
};

export default function TermsCheckbox({ value, onChange }: Props) {
    const { data, isPending, isError, refetch, isFetching } = useTerms();

    // The terms changed after a refetch, so the old tick does not count
    useEffect(() => {
        if (data && value !== null && value !== data.termsDocumentId) onChange(null);
    }, [data, value, onChange]);

    if (isPending) return <Spinner label="Loading terms..." />;
    if (isError) {
        return (
            <QueryError message="We could not load the terms. Please try again." onRetry={() => refetch()} busy={isFetching} />
        );
    }

    return (
        <div className="flex flex-col gap-2">
            <div
                role="region"
                aria-label="Terms and safety guidelines"
                tabIndex={0}
                className="max-h-[120px] overflow-y-auto whitespace-pre-wrap rounded-2xl bg-neutral-100 px-4 py-3 text-[13px] leading-normal text-neutral-800"
            >
                {data.content}
            </div>
            <label className="flex min-h-11 items-center gap-2.5">
                <input
                    type="checkbox"
                    className="h-5 w-5 flex-none accent-accent"
                    checked={value === data.termsDocumentId}
                    onChange={(e) => onChange(e.target.checked ? data.termsDocumentId : null)}
                />
                I have read and accept the terms and safety guidelines
            </label>
        </div>
    );
}

"use client";

import { useEffect } from "react";
import { useTerms } from "@/lib/use-terms";

type Props = {
    value: string | null;
    onChange: (termsDocumentId: string | null) => void;
};

export default function TermsCheckbox({ value, onChange }: Props) {
    const { data, isPending, isError } = useTerms();

    // The terms changed after a refetch, so the old tick does not count
    useEffect(() => {
        if (data && value !== null && value !== data.termsDocumentId) onChange(null);
    }, [data, value, onChange]);

    if (isPending) return <p>Loading terms...</p>;
    if (isError) {
        return (
            <p role="alert" className="rounded border border-red-500 p-3 text-red-500">
                We could not load the terms. Please try again.
            </p>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            <div
                role="region"
                aria-label="Terms"
                tabIndex={0}
                className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded border p-3 text-sm"
            >
                {data.content}
            </div>
            <label className="flex min-h-11 items-center gap-2">
                <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={value === data.termsDocumentId}
                    onChange={(e) => onChange(e.target.checked ? data.termsDocumentId : null)}
                />
                I accept the terms
            </label>
        </div>
    );
}

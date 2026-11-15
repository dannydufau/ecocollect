"use client";

import { useEffect } from "react";
import { Alert, Spinner } from "@/components/ui";
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
            <div className="space-y-2">
                <Alert variant="error">We could not load the terms. Please try again.</Alert>
                <button type="button" onClick={() => refetch()} disabled={isFetching}
                    className="min-h-11 rounded-lg border border-stone-400 px-4 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">
                    Try again
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            <div
                role="region"
                aria-label="Terms and safety guidelines"
                tabIndex={0}
                className="max-h-[120px] overflow-y-auto whitespace-pre-wrap rounded-xl bg-stone-100 px-4 py-3 text-[13px] leading-normal text-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
                {data.content}
            </div>
            <label className="flex min-h-11 items-center gap-2">
                <input
                    type="checkbox"
                    className="h-5 w-5 flex-none accent-[#9e5220]"
                    checked={value === data.termsDocumentId}
                    onChange={(e) => onChange(e.target.checked ? data.termsDocumentId : null)}
                />
                I have read and accept the terms and safety guidelines
            </label>
        </div>
    );
}

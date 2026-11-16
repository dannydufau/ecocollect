"use client";

import { useId, type ReactNode } from "react";

type Control = { id: string; "aria-describedby"?: string; "aria-invalid"?: true };

export function Field({ label, hint, error, optional = false, children }: {
    label: string;
    hint?: string;
    error?: string;
    optional?: boolean;
    children: (control: Control) => ReactNode;
}) {
    const id = useId();
    const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;

    return (
        <div className="flex flex-col gap-1">
            <label htmlFor={id} className="font-semibold">
                {label}
                {optional && <span className="font-normal text-neutral-700"> (optional)</span>}
            </label>
            {hint && <p id={`${id}-hint`} className="text-neutral-700">{hint}</p>}
            {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
            {error && <p id={`${id}-error`} className="text-red-700">{error}</p>}
        </div>
    );
}

"use client";

import { useId, type HTMLAttributes, type ReactNode } from "react";
import { AlertIcon } from "./icons";

type Control = { id: string; "aria-describedby"?: string; "aria-invalid"?: true };

// The message under an invalid field. The icon means the error is not told by colour alone.
export function FieldError({ className = "", children, ...rest }: HTMLAttributes<HTMLParagraphElement>) {
    return (
        <p role="alert" {...rest} className={`fade-in flex items-start gap-1.5 text-small font-semibold text-danger ${className}`}>
            <AlertIcon className="mt-0.5 size-4 flex-none" />
            {children}
        </p>
    );
}

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
            <label htmlFor={id} className="text-sm font-semibold">
                {label}
                {optional && <span className="font-normal text-text-muted"> (optional)</span>}
            </label>
            {hint && <p id={`${id}-hint`} className="text-small text-text-muted">{hint}</p>}
            {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
            {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
        </div>
    );
}

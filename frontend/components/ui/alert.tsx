"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Variant = "error" | "success" | "warning" | "info";

// Pale fill, a 1.5px ring and a short bold lead, so the kind is not told by color alone (the prototype's Alert)
const styles: Record<Variant, { box: string; lead: string }> = {
    error: { box: "bg-danger-50 text-danger-800 ring-danger", lead: "Error." },
    success: { box: "bg-accent-2-100 text-accent-2-800 ring-accent-2-500", lead: "Done." },
    warning: { box: "bg-warning-tint text-accent-800 ring-accent-500", lead: "Heads up." },
    info: { box: "bg-info-tint text-neutral-800 ring-neutral-400", lead: "Note." },
};

export function Alert({ variant, children, error, scrollIntoView = false }: {
    variant: Variant;
    children?: ReactNode;
    error?: Error | { message?: string } | string;
    scrollIntoView?: boolean;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const message = typeof error === "string" ? error : error?.message;

    useEffect(() => {
        if (scrollIntoView) ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, [scrollIntoView, children, message]);

    return (
        <div ref={ref} role={variant === "error" ? "alert" : "status"}
            className={`rounded-2xl px-4 py-3 text-[15px] leading-snug ring-[1.5px] ring-inset ${styles[variant].box}`}>
            <strong>{styles[variant].lead}</strong> {children ?? message}
        </div>
    );
}

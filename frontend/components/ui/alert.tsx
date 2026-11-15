"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Variant = "error" | "success" | "warning" | "info";

const styles: Record<Variant, string> = {
    error: "border-red-300 bg-red-50 text-red-900",
    success: "border-green-300 bg-green-50 text-green-900",
    warning: "border-amber-300 bg-amber-50 text-amber-900",
    info: "border-sky-300 bg-sky-50 text-sky-900",
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
            className={`rounded-lg border p-3 text-sm ${styles[variant]}`}>
            {children ?? message}
        </div>
    );
}

"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./button";
import { AlertIcon, CheckIcon, InfoIcon, WarningIcon } from "./icons";

type Variant = "error" | "success" | "warning" | "info";

// Pale fill, a thin border, an icon and a short bold lead, so the kind is not told by color alone
const styles: Record<Variant, { box: string; lead: string; Icon: typeof AlertIcon }> = {
    error: { box: "border-danger bg-danger-50 text-danger-800", lead: "Error.", Icon: AlertIcon },
    success: { box: "border-accent-2-500 bg-accent-2-100 text-accent-2-800", lead: "Done.", Icon: CheckIcon },
    warning: { box: "border-accent-500 bg-warning-tint text-accent-800", lead: "Heads up.", Icon: WarningIcon },
    info: { box: "border-neutral-400 bg-info-tint text-neutral-800", lead: "Note.", Icon: InfoIcon },
};

export function Alert({ variant, children, error, scrollIntoView = false, onDismiss }: {
    variant: Variant;
    children?: ReactNode;
    error?: Error | { message?: string } | string;
    scrollIntoView?: boolean;
    onDismiss?: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const message = typeof error === "string" ? error : error?.message;
    const { box, lead, Icon } = styles[variant];

    useEffect(() => {
        if (scrollIntoView) ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, [scrollIntoView, children, message]);

    return (
        <div ref={ref} className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-[15px] leading-snug ${box}`}>
            <Icon className="mt-px size-5 flex-none" />
            {/* The live region leaves out the Dismiss button, so it is not read with the message */}
            <div role={variant === "error" ? "alert" : "status"} className="min-w-0 flex-1 self-center">
                <strong>{lead}</strong> {children ?? message}
            </div>
            {onDismiss && <Button variant="ghost" size="sm" onClick={onDismiss} className="-my-1 flex-none">Dismiss</Button>}
        </div>
    );
}

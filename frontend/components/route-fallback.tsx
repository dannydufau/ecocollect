"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button, EmptyState, WarningIcon, pageWidth } from "@/components/ui";

export function RouteFallback({ title, icon, action }: { title: string; icon: ReactNode; action: ReactNode }) {
    const region = useRef<HTMLElement>(null);
    useEffect(() => { region.current?.focus(); }, []);

    return (
        <main ref={region} tabIndex={-1} aria-label={title} className={`${pageWidth} p-4 outline-none sm:p-8`}>
            <EmptyState heading title={title} icon={icon} action={action} />
        </main>
    );
}

export function RouteError({ onRetry }: { onRetry: () => void }) {
    return <RouteFallback title="Something went wrong." icon={<WarningIcon />}
        action={<Button onClick={onRetry}>Try again</Button>} />;
}

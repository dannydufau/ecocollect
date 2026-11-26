"use client";

import { useSyncExternalStore } from "react";
import { onlineManager } from "@tanstack/react-query";
import { pageWidth } from "@/components/ui";

const subscribeOnline = (cb: () => void) => onlineManager.subscribe(() => cb());
const getOnline = () => onlineManager.isOnline();
const getServerOnline = () => true;

export default function ConnectionBanner({ delayed = false }: { delayed?: boolean }) {
    const online = useSyncExternalStore(subscribeOnline, getOnline, getServerOnline);

    if (!online) {
        return (
            <div role="status" className="border-b border-border bg-warning-tint text-text">
                <p className={`${pageWidth} px-4 py-1.5 text-center text-small font-semibold sm:px-8`}>
                    You&apos;re offline. Some information may be out of date.
                </p>
            </div>
        );
    }

    if (delayed) {
        return (
            <div role="status" className="border-b border-border bg-info-tint text-text">
                <p className={`${pageWidth} px-4 py-1.5 text-center text-small sm:px-8`}>
                    Live updates are delayed. Refresh to see the latest changes.
                </p>
            </div>
        );
    }

    return null;
}

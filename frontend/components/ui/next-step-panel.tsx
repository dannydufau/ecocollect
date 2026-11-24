"use client";

import type { ReactNode } from "react";
import { nextStepText } from "@/lib/status-text";
import type { RequestStatus } from "@/lib/types";
import { LifecycleStepper } from "./lifecycle-stepper";
import { StatusAnnouncer, useStatusCue } from "./status-announcer";
import { StatusBadge } from "./status-badge";
import { card } from "./styles";

export function NextStepPanel({ title, status, viewer, facts, notices, actions, quiet = false }: {
    title: string;
    status: RequestStatus;
    viewer: "resident" | "volunteer";
    facts?: ReactNode;
    notices?: ReactNode;
    actions?: ReactNode;
    // The person's own action notice is on the page: a status change is theirs, so it is not announced
    quiet?: boolean;
}) {
    const { announcement, cue } = useStatusCue(status, quiet);
    // The fade (opacity only) runs when the status changes by itself, never on the first load
    const fade = cue > 0 ? "fade-in" : undefined;
    const inProgress = status !== "Cancelled" && status !== "Expired" && status !== "Missed";

    return <section aria-label="Request status" className={`${card} min-w-0 space-y-2`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="min-w-0 break-words text-[length:clamp(1.5rem,6vw,2rem)]">{title}</h1>
            <span key={`badge-${cue}`} className={fade}><StatusBadge status={status} /></span>
        </div>
        {inProgress && <LifecycleStepper status={status} />}
        <p key={`next-${cue}`} className={fade}>{nextStepText(status, viewer)}</p>
        {facts}
        {notices}
        {actions}
        <StatusAnnouncer message={announcement} />
    </section>;
}

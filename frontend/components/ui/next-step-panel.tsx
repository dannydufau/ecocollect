import type { ReactNode } from "react";
import { nextStepText } from "@/lib/status-text";
import type { RequestStatus } from "@/lib/types";
import { LifecycleStepper } from "./lifecycle-stepper";
import { StatusBadge } from "./status-badge";
import { card } from "./styles";

export function NextStepPanel({ title, status, viewer, facts, notices, actions }: {
    title: string;
    status: RequestStatus;
    viewer: "resident" | "volunteer";
    facts?: ReactNode;
    notices?: ReactNode;
    actions?: ReactNode;
}) {
    const inProgress = status !== "Cancelled" && status !== "Expired" && status !== "Missed";

    return <section aria-label="Request status" className={`${card} min-w-0 space-y-2`}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="min-w-0 break-words text-[length:clamp(1.5rem,6vw,2rem)]">{title}</h1>
            <StatusBadge status={status} />
        </div>
        {inProgress && <LifecycleStepper status={status} />}
        <p>{nextStepText(status, viewer)}</p>
        {facts}
        {notices}
        {actions}
    </section>;
}

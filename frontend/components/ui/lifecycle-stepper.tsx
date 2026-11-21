import type { RequestStatus } from "@/lib/types";
import { CheckIcon, ChevronRightIcon } from "./icons";
import { StatusBadge } from "./status-badge";

const steps = ["Open", "Assigned", "Collected", "Delivered"] as const;

export function LifecycleStepper({ status }: { status: RequestStatus }) {
    const current = steps.findIndex(step => step === status);
    // An early end has no later steps, and the status alone does not say how far it got
    const shown = current < 0 ? steps.slice(0, 1) : steps;
    return (
        <ol aria-label="Request progress" className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
            {shown.map((step, index) => <li key={step} aria-current={index === current ? "step" : undefined}
                className={`inline-flex items-center gap-1.5 ${index === current ? "font-bold" : index < current || current < 0 ? "" : "text-text-muted"}`}>
                {index > 0 && <ChevronRightIcon className="size-4" />}
                {(index < current || current < 0) && <CheckIcon className="size-4" />}
                {step}{index === current && " (now)"}
            </li>)}
            {current < 0 && <li className="inline-flex items-center gap-1.5"><ChevronRightIcon className="size-4" /><StatusBadge status={status} /></li>}
        </ol>
    );
}

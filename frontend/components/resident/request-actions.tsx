import { Fragment, type ReactNode } from "react";
import type { RequestDetail } from "@/lib/types";

// The main task first and the cancel actions last, so the main one stays in view on a phone
const residentActions = ["confirm_collected", "edit", "report_missed", "cancel_assignment", "cancel"] as const;
export type ResidentActionRenderers = Partial<Record<typeof residentActions[number], (request: RequestDetail) => ReactNode>>;

export function RequestActions({ request, renderers = {} }: {
    request: RequestDetail;
    renderers?: ResidentActionRenderers;
}) {
    const controls = residentActions.filter(action => request.allowedActions.includes(action) && renderers[action]);
    if (controls.length === 0) return null;

    return <section aria-label="Request actions" className="flex flex-wrap items-start gap-3">
        {controls.map(action => <Fragment key={action}>{renderers[action]?.(request)}</Fragment>)}
    </section>;
}

import { Fragment, type ReactNode } from "react";
import type { RequestDetail } from "@/lib/types";

const residentActions = ["edit", "cancel", "cancel_assignment", "confirm_collected", "report_missed"] as const;
export type ResidentActionRenderers = Partial<Record<typeof residentActions[number], (request: RequestDetail) => ReactNode>>;

export function RequestActions({ request, renderers = {} }: {
    request: RequestDetail;
    renderers?: ResidentActionRenderers;
}) {
    const controls = residentActions.filter(action => request.allowedActions.includes(action) && renderers[action]);
    if (controls.length === 0) return null;

    return <section aria-label="Request actions"
        className="flex flex-wrap items-start gap-2 sm:gap-3 max-sm:[&>button]:px-2.5 max-sm:[&>a]:px-2.5">
        {controls.map(action => <Fragment key={action}>{renderers[action]?.(request)}</Fragment>)}
    </section>;
}

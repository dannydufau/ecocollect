"use client";

import { useId, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { CancelRequest as CancelBody, RequestDetail } from "@/lib/types";
import { useRequestAction } from "@/lib/use-request";

export default function CancelRequest({ request }: { request: RequestDetail }) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState("");
    const sending = useRef(false);
    const reasonId = useId();
    const action = useRequestAction<CancelBody>(request.requestId,
        body => api.post(`/api/requests/${encodeURIComponent(request.requestId)}/cancel`, body),
        [queryKeys.myRequests, queryKeys.availableRequests, queryKeys.volunteerRequests, queryKeys.ecopoints]);
    const allowed = request.viewer === "owner" && request.allowedActions.includes("cancel");
    const reasonError = action.error instanceof ApiError ? action.error.fields.reason : undefined;

    function confirm() {
        if (!allowed || sending.current || action.isPending) return;
        sending.current = true;
        const trimmed = reason.trim();
        action.run(trimmed ? { reason: trimmed } : {}, {
            onSuccess: () => { setOpen(false); setReason(""); },
            onSettled: () => { sending.current = false; },
        });
    }

    if (request.viewer !== "owner") return null;
    return <>
        {allowed && <Button variant="danger" onClick={() => { setReason(""); setOpen(true); }}>Cancel request</Button>}
        {!open && !allowed && action.message && <Alert variant="error">{action.message}</Alert>}
        <ConfirmDialog open={open} title="Cancel this request?" confirmLabel={action.isPending ? "Cancelling..." : "Confirm cancellation"}
            danger busy={action.isPending} confirmDisabled={!allowed} error={action.message ?? undefined}
            onConfirm={confirm} onCancel={() => { if (!sending.current) setOpen(false); }}>
            <div className="space-y-3">
                <p>This cancels the pickup request. You can create a new request if you need another pickup.</p>
                {request.assignment?.outsideCancellationWindow && <Alert variant="warning">Cancelling this close to pickup may give the Volunteer cancellation EcoPoints.</Alert>}
                {!allowed && <p>This request can no longer be cancelled.</p>}
                <label htmlFor={reasonId} className="block font-medium">Reason (optional)</label>
                <textarea id={reasonId} value={reason} onChange={event => setReason(event.target.value)} disabled={action.isPending}
                    rows={3} aria-invalid={Boolean(reasonError)} aria-describedby={reasonError ? `${reasonId}-error` : undefined}
                    className="w-full min-w-0 rounded-lg border border-stone-400 p-3 focus-visible:outline-2 focus-visible:outline-offset-2" />
                {reasonError && <p id={`${reasonId}-error`} role="alert" className="text-red-700">{reasonError}</p>}
            </div>
        </ConfirmDialog>
    </>;
}

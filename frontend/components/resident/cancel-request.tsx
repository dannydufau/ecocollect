"use client";

import { useRef, useState } from "react";
import { Button, ConfirmDialog, Field, textarea } from "@/components/ui";
import { api, ApiError, friendlyError } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { CancelRequest as CancelBody, RequestDetail } from "@/lib/types";
import { useRequestAction } from "@/lib/use-request";

export type Notice = { kind: "success" | "error"; text: string };

// onNotice puts the result on the page. The page keeps it when the refresh removes this button and the component with it.
export default function CancelRequest({ request, onNotice }: { request: RequestDetail; onNotice: (notice: Notice | null) => void }) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState("");
    const sending = useRef(false);
    const action = useRequestAction<CancelBody>(request.requestId,
        async body => {
            try {
                const result = await api.post(`/api/requests/${encodeURIComponent(request.requestId)}/cancel`, body);
                onNotice({ kind: "success", text: "Request cancelled." });
                return result;
            } catch (error) {
                // The request changed under us (expired, not cancellable): the refresh takes the button away, the sentence stays on the page
                if (error instanceof ApiError && (error.status === 409 || error.status === 404)) onNotice({ kind: "error", text: friendlyError(error) });
                throw error;
            }
        },
        [queryKeys.myRequests, queryKeys.availableRequests, queryKeys.volunteerRequests, queryKeys.ecopoints]);
    const allowed = request.viewer === "owner" && request.allowedActions.includes("cancel");
    const reasonError = action.error instanceof ApiError ? action.error.fields.reason : undefined;

    function confirm() {
        if (sending.current || action.isPending) return;
        sending.current = true;
        const trimmed = reason.trim();
        action.run(trimmed ? { reason: trimmed } : {}, {
            onSuccess: () => { setOpen(false); setReason(""); },
            onSettled: () => { sending.current = false; },
        });
    }

    if (!allowed) return null;
    return <>
        <Button variant="danger-outline" onClick={() => { setReason(""); onNotice(null); setOpen(true); }}>Cancel request</Button>
        <ConfirmDialog open={open} title="Cancel this request?" confirmLabel={action.isPending ? "Cancelling..." : "Cancel request"} cancelLabel="Keep request"
            danger busy={action.isPending} error={action.message ?? undefined}
            onConfirm={confirm} onCancel={() => { if (!sending.current) setOpen(false); }}>
            <div className="space-y-3">
                <p>{request.status === "Assigned" ? "The volunteer will be told, and the request will be cancelled." : "Volunteers will no longer see it."}</p>
                <Field label="Reason" optional error={reasonError}>
                    {control => <textarea {...control} value={reason} onChange={event => setReason(event.target.value)} disabled={action.isPending}
                        rows={3} className={textarea} />}
                </Field>
            </div>
        </ConfirmDialog>
    </>;
}

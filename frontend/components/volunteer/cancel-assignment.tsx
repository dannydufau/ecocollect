"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ConfirmDialog, Field, textarea } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { CancelAssignment as CancelBody, RequestDetail } from "@/lib/types";
import { useRequestAction } from "@/lib/use-request";

export default function CancelAssignment({ request }: { request: RequestDetail }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState("");
    const [failed, setFailed] = useState(false);
    const action = useRequestAction<CancelBody>(request.requestId,
        body => api.post(`/api/requests/${encodeURIComponent(request.requestId)}/assignment/cancel`, body),
        [queryKeys.volunteerRequests]);
    const reasonError = action.error instanceof ApiError ? action.error.fields.reason : undefined;

    function confirm() {
        if (action.isPending) return;
        const trimmed = reason.trim();
        action.run(trimmed ? { as: "volunteer", reason: trimmed } : { as: "volunteer" }, {
            onSuccess: () => router.push("/volunteer/history?cancelled=1"),
            onError: error => {
                // #471 Part 1: when a volunteer's cancel expires the request, Q12 answers 404 request_unavailable even though the cancel succeeded.
                if (error instanceof ApiError && error.status === 404 && error.code === "request_unavailable") {
                    router.push("/volunteer/history?cancelled=1");
                    return;
                }
                setFailed(true);
            },
        });
    }

    return <>
        <Button variant="danger-outline" onClick={() => { setReason(""); setFailed(false); setOpen(true); }}>Cancel assignment</Button>
        <ConfirmDialog open={open} title="Cancel your assignment?" danger confirmLabel={action.isPending ? "Cancelling..." : "Cancel assignment"}
            cancelLabel="Keep assignment" busy={action.isPending} error={failed ? action.message ?? undefined : undefined}
            onConfirm={confirm} onCancel={() => setOpen(false)}>
            <div className="space-y-3">
                <p>The request goes back to Open if it still has future pickup windows. You do not earn EcoPoints for cancelling.</p>
                <Field label="Reason" optional error={reasonError} hint={`${reason.length} / 500 characters`}>
                    {control => <textarea {...control} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} disabled={action.isPending}
                        rows={3} className={textarea} />}
                </Field>
            </div>
        </ConfirmDialog>
    </>;
}

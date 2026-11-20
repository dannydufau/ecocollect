"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ConfirmDialog, Field, textarea } from "@/components/ui";
import { api } from "@/lib/api";
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

    function confirm() {
        if (action.isPending) return;
        const trimmed = reason.trim();
        action.run(trimmed ? { as: "volunteer", reason: trimmed } : { as: "volunteer" }, {
            onSuccess: () => router.push("/volunteer/history"),
            onError: () => setFailed(true),
        });
    }

    return <>
        <Button variant="danger-outline" onClick={() => { setReason(""); setFailed(false); setOpen(true); }}>Cancel assignment</Button>
        <ConfirmDialog open={open} title="Cancel this pickup?" danger confirmLabel={action.isPending ? "Cancelling..." : "Cancel assignment"}
            cancelLabel="Keep pickup" busy={action.isPending} error={failed ? action.message ?? undefined : undefined}
            onConfirm={confirm} onCancel={() => setOpen(false)}>
            <div className="space-y-3">
                <p>The resident will be told and the request goes back to the available list.</p>
                <Field label="Reason" optional>
                    {control => <textarea {...control} value={reason} onChange={event => setReason(event.target.value)} disabled={action.isPending}
                        rows={3} className={textarea} />}
                </Field>
            </div>
        </ConfirmDialog>
    </>;
}

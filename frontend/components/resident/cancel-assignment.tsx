"use client";

import { useRef, useState } from "react";
import { Alert, Button, ConfirmDialog, Field, textarea } from "@/components/ui";
import { api, ApiError, friendlyError } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { CancelAssignment as CancelBody, PickupWindow, RequestDetail } from "@/lib/types";
import { useRequestAction } from "@/lib/use-request";
import type { Notice } from "./cancel-request";
import { validate } from "./request-form";
import { WindowsPicker } from "./windows-picker";

export default function CancelAssignment({ request, onNotice }: { request: RequestDetail; onNotice: (notice: Notice | null) => void }) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState("");
    const [windows, setWindows] = useState<PickupWindow[]>([]);
    const [windowError, setWindowError] = useState("");
    const sending = useRef(false);
    const action = useRequestAction<CancelBody>(request.requestId,
        async body => {
            try {
                const result = await api.post(`/api/requests/${encodeURIComponent(request.requestId)}/assignment/cancel`, body);
                onNotice({ kind: "success", text: "The assignment was cancelled." });
                return result;
            } catch (error) {
                // The refresh takes the button away (window ended), so the sentence stays on the page
                if (error instanceof ApiError && (error.status === 409 || error.status === 404)) onNotice({ kind: "error", text: friendlyError(error) });
                throw error;
            }
        },
        [queryKeys.myRequests, queryKeys.availableRequests, queryKeys.volunteerRequests]);

    function start() {
        setReason("");
        setWindows([]);
        setWindowError("");
        onNotice(null);
        setOpen(true);
    }

    function confirm() {
        if (sending.current || action.isPending) return;
        // The request form's window rules, against the original creation time. The item is only there to fill the form.
        const error = windows.length ? validate({ items: [{ categoryId: "x", quantity: "1" }], windows, notes: "" }, request.createdAt).windows : undefined;
        setWindowError(error ?? "");
        if (error) return;
        sending.current = true;
        const trimmed = reason.trim();
        action.run({ as: "resident", ...(trimmed ? { reason: trimmed } : {}), ...(windows.length ? { windows } : {}) }, {
            onSuccess: () => setOpen(false),
            onSettled: () => { sending.current = false; },
        });
    }

    if (request.viewer !== "owner" || !request.allowedActions.includes("cancel_assignment")) return null;
    return <>
        <Button variant="danger-outline" onClick={start}>Cancel volunteer</Button>
        <ConfirmDialog open={open} title="Cancel the volunteer's assignment?" confirmLabel={action.isPending ? "Cancelling..." : "Cancel volunteer"} cancelLabel="Keep volunteer"
            danger size="lg" busy={action.isPending} error={windowError || action.message || undefined}
            onConfirm={confirm} onCancel={() => { if (!sending.current) setOpen(false); }}>
            <div className="space-y-3">
                <p>Your request stays active. It goes back to Open if it still has future pickup windows. You can offer new windows below.</p>
                {request.assignment?.outsideCancellationWindow && <Alert variant="warning">The pickup is less than 24 hours away. The volunteer will receive EcoPoints for this cancellation.</Alert>}
                <Field label="Reason" optional>
                    {control => <textarea {...control} value={reason} onChange={event => setReason(event.target.value)} disabled={action.isPending}
                        rows={3} className={textarea} />}
                </Field>
                <p className="text-[13px] text-text-muted">Optional: offer new pickup windows. Leave them empty to keep the current ones.</p>
                <WindowsPicker embedded value={windows} onChange={setWindows} createdAt={request.createdAt} />
            </div>
        </ConfirmDialog>
    </>;
}

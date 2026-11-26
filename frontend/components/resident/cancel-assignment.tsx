"use client";

import { useState } from "react";
import { Alert, Button, ConfirmDialog, Field, textarea } from "@/components/ui";
import { api, ApiError, friendlyError } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { CancelAssignment as CancelBody, PickupWindow, RequestDetail } from "@/lib/types";
import { useRequestAction } from "@/lib/use-request";
import { volunteerEarnsCancellationPoints, type Notice } from "./cancel-request";
import { validate } from "./request-form";
import { WindowsPicker } from "./windows-picker";

export default function CancelAssignment({ request, onNotice }: { request: RequestDetail; onNotice: (notice: Notice | null) => void }) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState("");
    const [windows, setWindows] = useState<PickupWindow[]>([]);
    const [incompleteWindows, setIncompleteWindows] = useState(false);
    const [triedWindows, setTriedWindows] = useState(false);
    const [windowError, setWindowError] = useState("");
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
        setIncompleteWindows(false);
        setTriedWindows(false);
        setWindowError("");
        onNotice(null);
        setOpen(true);
    }

    function confirm() {
        if (action.isPending) return;
        if (incompleteWindows) {
            setTriedWindows(true);
            setWindowError("Choose both a date and an hour, or remove this window.");
            return;
        }
        // The request form's window rules, against the original creation time. The item is only there to fill the form.
        const error = windows.length ? validate({ items: [{ categoryId: "x", quantity: "1" }], windows, notes: "" }, request.createdAt).windows : undefined;
        setWindowError(error ?? "");
        if (error) return;
        const trimmed = reason.trim();
        action.run({ as: "resident", ...(trimmed ? { reason: trimmed } : {}), ...(windows.length ? { windows } : {}) }, {
            onSuccess: () => setOpen(false),
        });
    }

    if (request.viewer !== "owner" || !request.allowedActions.includes("cancel_assignment")) return null;
    return <>
        <Button variant="danger-outline" onClick={start}>Cancel assignment</Button>
        <ConfirmDialog open={open} title="Cancel the volunteer's assignment?" confirmLabel={action.isPending ? "Cancelling..." : "Cancel assignment"} cancelLabel="Keep assignment"
            danger size="lg" busy={action.isPending} error={windowError || action.message || undefined}
            onConfirm={confirm} onCancel={() => { if (!action.isPending) setOpen(false); }}>
            <div className="space-y-3">
                <p>Your request stays active. It goes back to Open if it still has future pickup windows. You can offer new windows below.</p>
                {volunteerEarnsCancellationPoints(request) && <Alert variant="warning">The pickup is less than 24 hours away. The volunteer will receive EcoPoints for this cancellation.</Alert>}
                <Field label="Reason" optional error={action.error instanceof ApiError ? action.error.fields.reason : undefined} hint={`${reason.length} / 500 characters`}>
                    {control => <textarea {...control} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} disabled={action.isPending}
                        rows={3} className={textarea} />}
                </Field>
                <p className="text-small text-text-muted">Optional: offer new pickup windows. Leave them empty to keep the current ones.</p>
                <WindowsPicker embedded value={windows} onChange={next => { setWindows(next); setWindowError(""); }}
                    createdAt={request.createdAt} showIncomplete={triedWindows}
                    onIncompleteChange={incomplete => { setIncompleteWindows(incomplete); if (!incomplete) setWindowError(""); }} />
            </div>
        </ConfirmDialog>
    </>;
}

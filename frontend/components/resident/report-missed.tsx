"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import TermsCheckbox from "@/components/terms-checkbox";
import { Button, ConfirmDialog, Field, textarea } from "@/components/ui";
import { api, ApiError, friendlyError } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { CreatedRequest, PickupWindow, ReportMissed as MissedBody, RequestDetail } from "@/lib/types";
import { useRequestAction } from "@/lib/use-request";
import { useTerms } from "@/lib/use-terms";
import type { Notice } from "./cancel-request";
import { validate } from "./request-form";
import { WindowsPicker } from "./windows-picker";

export default function ReportMissed({ request, onNotice }: { request: RequestDetail; onNotice: (notice: Notice | null) => void }) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const terms = useTerms();
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState("");
    const [reschedule, setReschedule] = useState(false);
    const [windows, setWindows] = useState<PickupWindow[]>([]);
    const [incompleteWindows, setIncompleteWindows] = useState(false);
    const [termsId, setTermsId] = useState<string | null>(null);
    const action = useRequestAction<MissedBody>(request.requestId,
        async body => {
            try {
                const result = await api.post<{ rescheduledRequest: CreatedRequest | null }>(`/api/requests/${encodeURIComponent(request.requestId)}/assignment/missed`, body);
                onNotice({ kind: "success", text: "Missed pickup reported." });
                return result;
            } catch (error) {
                // The refresh can take the button away, so the sentence stays on the page. Outdated terms are fixed in the dialog.
                if (error instanceof ApiError && (error.status === 409 || error.status === 404) && error.code !== "terms_outdated") onNotice({ kind: "error", text: friendlyError(error) });
                throw error;
            }
        },
        [queryKeys.myRequests, queryKeys.availableRequests]);

    // The new request is created now, so the window rules use the current time. The item is only there to fill the form.
    const windowsValid = !incompleteWindows && !validate({ items: [{ categoryId: "x", quantity: "1" }], windows, notes: "" }).windows;
    const accepted = termsId !== null && termsId === terms.data?.termsDocumentId;
    const ready = !reschedule || (windowsValid && accepted);

    function start() {
        setReason("");
        setReschedule(false);
        setWindows([]);
        setIncompleteWindows(false);
        setTermsId(null);
        onNotice(null);
        setOpen(true);
    }

    function confirm() {
        if (action.isPending || !ready) return;
        const trimmed = reason.trim();
        action.run({
            ...(trimmed ? { reason: trimmed } : {}),
            ...(reschedule && termsId ? { reschedule: { windows, termsDocumentId: termsId } } : {}),
        }, {
            onSuccess: result => {
                setOpen(false);
                const next = (result as { rescheduledRequest: CreatedRequest | null }).rescheduledRequest;
                if (next) router.push(`/resident/requests/${encodeURIComponent(next.requestId)}?rescheduled=1`);
            },
            onError: error => {
                if (error instanceof ApiError && error.code === "terms_outdated") {
                    setTermsId(null);
                    void queryClient.invalidateQueries({ queryKey: queryKeys.terms });
                }
            },
        });
    }

    if (request.viewer !== "owner" || !request.allowedActions.includes("report_missed")) return null;
    return <>
        <Button variant="danger-outline" onClick={start}>Report missed pickup</Button>
        <ConfirmDialog open={open} title="Report a missed pickup?" confirmLabel={action.isPending ? "Reporting..." : "Report missed pickup"} cancelLabel="Cancel"
            danger size="lg" busy={action.isPending} confirmDisabled={!ready} error={action.message ?? undefined}
            blocked={windowsValid ? "Accept the terms." : "Choose valid pickup windows."}
            onConfirm={confirm} onCancel={() => { if (!action.isPending) setOpen(false); }}>
            <div className="space-y-3">
                <p>Use this if the volunteer did not come. The request will be marked Missed.</p>
                <Field label="Reason" optional error={action.error instanceof ApiError ? action.error.fields.reason : undefined} hint={`${reason.length} / 500 characters`}>
                    {control => <textarea {...control} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} disabled={action.isPending}
                        rows={3} className={textarea} />}
                </Field>
                <label className="flex min-h-11 items-center gap-2.5">
                    <input type="checkbox" className="size-6 flex-none accent-accent" checked={reschedule} disabled={action.isPending}
                        onChange={event => { setReschedule(event.target.checked); if (!event.target.checked) setIncompleteWindows(false); }} />
                    Create a new request with new pickup windows
                </label>
                {reschedule && <>
                    <WindowsPicker embedded value={windows} onChange={setWindows} showIncomplete={incompleteWindows} onIncompleteChange={setIncompleteWindows} />
                    <TermsCheckbox value={termsId} onChange={setTermsId} />
                </>}
            </div>
        </ConfirmDialog>
    </>;
}

"use client";

import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import TermsCheckbox from "@/components/terms-checkbox";
import { Button, CheckIcon, ConfirmDialog } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { formatWindow, friendlyWindow } from "@/lib/time";
import type { AcceptRequest as AcceptBody, RequestDetail } from "@/lib/types";
import { useRequestAction } from "@/lib/use-request";

export default function AcceptRequest({ request, onDone }: { request: RequestDetail; onDone: (message: string) => void }) {
    const queryClient = useQueryClient();
    const name = useId();
    const [open, setOpen] = useState(false);
    const [windowId, setWindowId] = useState<string | null>(null);
    const [termsId, setTermsId] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);
    const action = useRequestAction<AcceptBody>(request.requestId,
        body => api.post(`/api/requests/${encodeURIComponent(request.requestId)}/assignment`, body),
        [queryKeys.availableRequests, queryKeys.volunteerRequests]);

    function start() {
        // One window needs no choice
        setWindowId(request.windows.length === 1 ? request.windows[0].windowId : null);
        setTermsId(null);
        setFailed(false);
        setOpen(true);
    }

    function confirm() {
        if (action.isPending || !windowId || !termsId) return;
        action.run({ windowId, termsDocumentId: termsId }, {
            onSuccess: () => {
                setOpen(false);
                onDone("You accepted this request. The pickup address is shown below.");
            },
            onError: error => {
                setFailed(true);
                if (error instanceof ApiError && error.code === "terms_outdated") void queryClient.invalidateQueries({ queryKey: queryKeys.terms });
            },
        });
    }

    return <>
        <Button onClick={start}>Accept request</Button>
        <ConfirmDialog open={open} size="lg" title="Accept this request" confirmLabel={action.isPending ? "Accepting..." : "Accept request"}
            confirmDisabled={!windowId || !termsId} busy={action.isPending} error={failed ? action.message ?? undefined : undefined}
            onConfirm={confirm} onCancel={() => setOpen(false)}>
            <div className="space-y-4">
                <p>Pick one pickup window. The street address is shown after you accept.</p>
                <fieldset className="min-w-0 space-y-2">
                    <legend className="mb-1 font-semibold">Pickup window</legend>
                    {request.windows.map(window => (
                        <label key={window.windowId} className={`flex min-h-11 min-w-0 cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-2.5 ${windowId === window.windowId ? "border-accent-2-700 bg-accent-2-200 ring-1 ring-accent-2-700" : "border-border-strong bg-white"}`}>
                            <input type="radio" name={name} value={window.windowId} checked={windowId === window.windowId}
                                onChange={() => setWindowId(window.windowId)} className="mt-1 h-5 w-5 flex-none accent-accent" />
                            <span className="min-w-0 flex-1">
                                <span className="block font-semibold">{friendlyWindow(window)}</span>
                                <span className="block text-caption text-text-muted">{formatWindow(window)}</span>
                            </span>
                            {windowId === window.windowId && <CheckIcon className="size-5 flex-none text-accent-2-800" />}
                        </label>
                    ))}
                </fieldset>
                <TermsCheckbox value={termsId} onChange={setTermsId} />
            </div>
        </ConfirmDialog>
    </>;
}

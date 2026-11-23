"use client";

import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import TermsCheckbox from "@/components/terms-checkbox";
import { Button, ChoiceCard, ConfirmDialog } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { calgaryInstant, formatWindow, friendlyWindow } from "@/lib/time";
import type { AcceptRequest as AcceptBody, RequestDetail } from "@/lib/types";
import { useRequestAction } from "@/lib/use-request";

function hasStarted(window: RequestDetail["windows"][number], now: number) {
    return calgaryInstant(window.date, window.startHour).getTime() <= now;
}

export default function AcceptRequest({ request, onDone }: { request: RequestDetail; onDone: (message: string) => void }) {
    const queryClient = useQueryClient();
    const name = useId();
    const [open, setOpen] = useState(false);
    const [windowId, setWindowId] = useState<string | null>(null);
    const [checkedAt, setCheckedAt] = useState(0);
    const [windowStarted, setWindowStarted] = useState(false);
    const [termsId, setTermsId] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);
    const action = useRequestAction<AcceptBody>(request.requestId,
        body => api.post(`/api/requests/${encodeURIComponent(request.requestId)}/assignment`, body),
        [queryKeys.availableRequests, queryKeys.volunteerRequests]);

    const allStarted = request.windows.every(window => hasStarted(window, checkedAt));

    function start() {
        const now = Date.now();
        setCheckedAt(now);
        const [onlyWindow] = request.windows;
        setWindowId(request.windows.length === 1 && !hasStarted(onlyWindow, now) ? onlyWindow.windowId : null);
        setTermsId(null);
        setFailed(false);
        setWindowStarted(false);
        setOpen(true);
    }

    function confirm() {
        if (action.isPending || !windowId || !termsId) return;
        const window = request.windows.find(window => window.windowId === windowId);
        const now = Date.now();
        if (!window || hasStarted(window, now)) {
            setCheckedAt(now);
            setWindowId(null);
            setWindowStarted(true);
            return;
        }
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
            confirmDisabled={!windowId || !termsId} busy={action.isPending} error={windowStarted ? "That pickup window has started. Choose another." : failed ? action.message ?? undefined : undefined}
            blocked={!windowId ? (allStarted ? "Every pickup window has started." : "Choose a pickup window.") : "Accept the terms."}
            onConfirm={confirm} onCancel={() => setOpen(false)}>
            <div className="space-y-4">
                <p>Pick one pickup window. The street address is shown after you accept.</p>
                <fieldset className="min-w-0 space-y-2">
                    <legend className="mb-1 font-semibold">Pickup window</legend>
                    {request.windows.map(window => (
                        <ChoiceCard key={window.windowId} name={name} value={window.windowId} tone="volunteer"
                            title={friendlyWindow(window)} detail={<span className="text-caption text-text-muted">{formatWindow(window)}</span>}
                            checked={windowId === window.windowId} onChange={id => { setWindowId(id); setWindowStarted(false); }} disabled={hasStarted(window, checkedAt)} />
                    ))}
                </fieldset>
                <TermsCheckbox value={termsId} onChange={setTermsId} />
            </div>
        </ConfirmDialog>
    </>;
}

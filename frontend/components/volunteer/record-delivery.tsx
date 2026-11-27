"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import PhotoPicker from "@/components/photo-picker";
import { Button, ConfirmDialog } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { RecordDelivery as DeliveryBody, RequestDetail } from "@/lib/types";
import { useRequestAction } from "@/lib/use-request";
import { FacilityPicker } from "./facility-picker";

function hasFacilityFieldError(err: unknown): boolean {
    return err instanceof ApiError && err.status === 400 && "facilityId" in err.fields;
}

export default function RecordDelivery({ request, onDone }: { request: RequestDetail; onDone: (message: string) => void }) {
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [facilityId, setFacilityId] = useState<string | null>(null);
    const [fileId, setFileId] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);
    const action = useRequestAction<DeliveryBody>(request.requestId,
        body => api.post(`/api/requests/${encodeURIComponent(request.requestId)}/assignment/delivery`, body),
        [queryKeys.volunteerRequests, queryKeys.ecopoints]);

    function start() {
        setFacilityId(null);
        setFileId(null);
        setFailed(false);
        setOpen(true);
    }

    function confirm() {
        if (action.isPending || !facilityId || !fileId) return;
        action.run({ facilityId, evidencePhoto: { fileId } }, {
            onSuccess: () => {
                setOpen(false);
                onDone("Delivery recorded. EcoPoints are on their way.");
            },
            onError: (err) => {
                setFailed(true);
                // If a facility became unavailable while the dialog was open, refresh eligible
                // locations and clear the stale selection while keeping the uploaded photo intact.
                if (hasFacilityFieldError(err)) {
                    setFacilityId(null);
                    void queryClient.invalidateQueries({ queryKey: queryKeys.facilities(request.category.categoryId) });
                }
            },
        });
    }

    return <>
        <Button onClick={start}>Record delivery</Button>
        <ConfirmDialog open={open} size="lg" title="Record delivery" confirmLabel={action.isPending ? "Saving..." : "Record delivery"}
            confirmDisabled={!facilityId || !fileId} busy={action.isPending} error={failed ? action.message ?? undefined : undefined}
            blocked={!facilityId ? "Choose a facility." : "Add a delivery photo."}
            onConfirm={confirm} onCancel={() => setOpen(false)}>
            <div className="space-y-4">
                <FacilityPicker categoryId={request.category.categoryId} value={facilityId} onChange={setFacilityId} />
                <div className="space-y-1">
                    <p className="font-semibold">Delivery photo</p>
                    <p className="text-text-muted">Add a photo of the items at the facility. Only you and the resident can see it.</p>
                    <PhotoPicker purpose="delivery_evidence" requestId={request.requestId} onUploaded={setFileId} onClear={() => setFileId(null)} />
                </div>
            </div>
        </ConfirmDialog>
    </>;
}

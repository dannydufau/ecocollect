"use client";

import { useState } from "react";
import PhotoPicker from "@/components/photo-picker";
import { Button, ConfirmDialog } from "@/components/ui";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { RecordDelivery as DeliveryBody, RequestDetail } from "@/lib/types";
import { useRequestAction } from "@/lib/use-request";
import { FacilityPicker } from "./facility-picker";

export default function RecordDelivery({ request }: { request: RequestDetail }) {
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
            onSuccess: () => setOpen(false),
            onError: () => setFailed(true),
        });
    }

    return <>
        <Button onClick={start}>Record delivery</Button>
        <ConfirmDialog open={open} title="Record the delivery" confirmLabel={action.isPending ? "Saving..." : "Record delivery"}
            confirmDisabled={!facilityId || !fileId} busy={action.isPending} error={failed ? action.message ?? undefined : undefined}
            onConfirm={confirm} onCancel={() => setOpen(false)}>
            <div className="space-y-4">
                <FacilityPicker categoryId={request.category.categoryId} value={facilityId} onChange={setFacilityId} />
                <div className="space-y-1">
                    <p className="font-semibold">Delivery photo</p>
                    <PhotoPicker purpose="delivery_evidence" requestId={request.requestId} onUploaded={setFileId} onClear={() => setFileId(null)} />
                </div>
            </div>
        </ConfirmDialog>
    </>;
}

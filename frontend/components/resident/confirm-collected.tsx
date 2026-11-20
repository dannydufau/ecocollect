"use client";

import { useRef } from "react";
import { Button } from "@/components/ui";
import { api, friendlyError } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { RequestDetail } from "@/lib/types";
import { useRequestAction } from "@/lib/use-request";
import type { Notice } from "./cancel-request";

// No dialog here, so every result goes to the page notice
export default function ConfirmCollected({ request, onNotice }: { request: RequestDetail; onNotice: (notice: Notice | null) => void }) {
    const sending = useRef(false);
    const action = useRequestAction(request.requestId,
        async () => {
            try {
                const result = await api.post(`/api/requests/${encodeURIComponent(request.requestId)}/assignment/collected`);
                onNotice({ kind: "success", text: "Collection confirmed." });
                return result;
            } catch (error) {
                onNotice({ kind: "error", text: friendlyError(error) });
                throw error;
            }
        },
        [queryKeys.myRequests]);

    function confirm() {
        if (sending.current || action.isPending) return;
        sending.current = true;
        onNotice(null);
        action.run(undefined, { onSettled: () => { sending.current = false; } });
    }

    if (request.viewer !== "owner" || !request.allowedActions.includes("confirm_collected")) return null;
    return <div className="space-y-2">
        <p>Confirm only after the volunteer has taken your items.</p>
        <Button onClick={confirm} busy={action.isPending} busyLabel="Confirming...">Confirm collected</Button>
    </div>;
}

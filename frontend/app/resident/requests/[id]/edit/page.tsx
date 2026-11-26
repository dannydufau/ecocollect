"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import RequestForm, { shownInForm, type RequestValues } from "@/components/resident/request-form";
import { Alert, EmptyState, LoadingRegion, PackageIcon, QueryError, pageTitle, pageWidth, secondaryLinkButton, textLink } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { EditRequest, PickupWindow } from "@/lib/types";
import { useRequestAction, useRequestDetail } from "@/lib/use-request";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";

// Windows are the same when they have the same dates and hours, in any order
const slots = (windows: PickupWindow[]) => windows.map(window => `${window.date}:${window.startHour}`).sort().join();

// Q9 names the item's fields at the top; the form names them items[0].*
const ITEM_FIELDS = ["categoryId", "quantity", "photo", "photo.fileId"];
const toFormField = (field: string) => ITEM_FIELDS.includes(field) ? `items[0].${field}` : field;
const toFormFields = (fields: Record<string, string>) =>
    Object.fromEntries(Object.entries(fields).map(([field, text]) => [toFormField(field), text]));

export default function EditRequestPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const { data, isPending, isError, unavailable, refetch, isFetching } = useRequestDetail(id);
    const [unchanged, setUnchanged] = useState(false);
    const [dirty, setDirty] = useState(false);
    useUnsavedWarning(dirty);
    const action = useRequestAction<EditRequest>(id,
        body => api.patch(`/api/requests/${encodeURIComponent(id)}`, body),
        [queryKeys.myRequests, queryKeys.availableRequests], field => shownInForm(toFormField(field)));
    const back = `/resident/requests/${encodeURIComponent(id)}`;

    function save(values: RequestValues) {
        if (!data || action.isPending) return;
        const item = values.items[0];
        const notes = values.notes.trim();
        const body: EditRequest = {};
        if (item.categoryId !== data.category.categoryId) body.categoryId = item.categoryId;
        if (Number(item.quantity) !== data.quantity) body.quantity = Number(item.quantity);
        if (notes !== (data.notes ?? "")) body.notes = notes || null;
        if (slots(values.windows) !== slots(data.windows)) body.windows = values.windows.map(({ date, startHour }) => ({ date, startHour }));
        if (item.photo !== undefined) body.photo = item.photo;
        setUnchanged(!Object.keys(body).length);
        if (!Object.keys(body).length) return;
        action.run(body, { onSuccess: () => { setDirty(false); router.replace(back); } });
    }

    const editable = data && data.viewer === "owner" && data.allowedActions.includes("edit");
    const blocked = unavailable || (data && !editable);
    return (
        <main className={`${pageWidth} p-4 sm:p-8`}>
            <div className="max-w-3xl space-y-6">
                {!blocked && <Link href={back} className={textLink}>Back to request</Link>}
                <h1 className={pageTitle}>Edit request</h1>
                {action.message && <Alert variant="error">{action.message}</Alert>}
                {isPending && <LoadingRegion label="Loading your request..." />}
                {isError && !unavailable && <QueryError message="We could not load your request. Please try again." onRetry={() => void refetch()} busy={isFetching} />}
                {blocked && <EmptyState icon={<PackageIcon />} title="This request can't be edited now."
                    action={<Link href={back} className={secondaryLinkButton}>Back to request</Link>} />}
                {data && editable && <RequestForm single createdAt={data.createdAt} submitLabel="Save changes" cancelHref={back} busy={action.isPending}
                    currentPhoto={data.photoUrl ? { url: data.photoUrl, refetch: () => void refetch() } : undefined}
                    fieldErrors={action.error instanceof ApiError ? toFormFields(action.error.fields) : {}}
                    initialValues={{
                        items: [{ categoryId: data.category.categoryId, quantity: String(data.quantity) }],
                        windows: data.windows.map(({ date, startHour }) => ({ date, startHour })),
                        notes: data.notes ?? "",
                    }}
                    onEdit={() => { setUnchanged(false); setDirty(true); }} onValid={save}>
                    {unchanged && <Alert variant="info">Nothing changed, so there is nothing to save.</Alert>}
                </RequestForm>}
            </div>
        </main>
    );
}

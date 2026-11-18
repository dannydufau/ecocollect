"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, Button, RequestPhoto, Spinner, StatusBadge, WindowList, card, pageTitle, textLink } from "@/components/ui";
import { isAuthError } from "@/lib/api";
import { nextStepText } from "@/lib/status-text";
import { formatTimestamp } from "@/lib/time";
import type { RequestDetail } from "@/lib/types";
import { useRequestDetail } from "@/lib/use-request";
import CancelRequest, { type Notice } from "./cancel-request";
import { RequestActions, type ResidentActionRenderers } from "./request-actions";
import StatusHistory from "./status-history";

const cardStyle = `${card} min-w-0 space-y-3`;
const cardTitle = "text-[22px]";

function UnavailableRequest() {
    return <section className="space-y-3">
        <h1 className={pageTitle}>This request is no longer available.</h1>
        <Link href="/resident" className={textLink}>Back to my requests</Link>
    </section>;
}

export default function ResidentRequestDetail({ requestId, actionRenderers }: {
    requestId: string;
    actionRenderers?: ResidentActionRenderers;
}) {
    const { data, isPending, isError, unavailable, error, refetch, isFetching } = useRequestDetail(requestId);
    const [notice, setNotice] = useState<Notice | null>(null);
    if (unavailable || (data && data.viewer !== "owner")) return <UnavailableRequest />;
    if (isPending) return <Spinner label="Loading your request..." />;
    if (isError || !data) return <section className="space-y-3">
        <h1 className={pageTitle}>Pickup request</h1>
        <Alert variant="error">{isAuthError(error)
            ? "You are not allowed to see this request. Please log in again as a resident."
            : "We could not load your request. Please try again."}</Alert>
        {!isAuthError(error) && <div><Button variant="secondary" onClick={() => void refetch()} busy={isFetching} busyLabel="Trying...">Try again</Button></div>}
        <Link href="/resident" className={textLink}>Back to my requests</Link>
    </section>;

    // The cancel button goes in with the other actions, so they all sit in one group
    const renderers: ResidentActionRenderers = { cancel: request => <CancelRequest request={request} onNotice={setNotice} />, ...actionRenderers };
    return <ResidentRequestView request={data} onPhotoError={() => { void refetch(); }} actionRenderers={renderers} notice={notice} />;
}

export function ResidentRequestView({ request, onPhotoError, actionRenderers, notice }: {
    request: RequestDetail;
    onPhotoError: () => void;
    actionRenderers?: ResidentActionRenderers;
    notice?: Notice | null;
}) {
    if (request.viewer !== "owner") return <UnavailableRequest />;

    return <>
        <Link href="/resident" className={textLink}>Back to my requests</Link>
        <header className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
                <h1 className={`break-words ${pageTitle}`}>{request.quantity} × {request.category.name}</h1>
                <StatusBadge status={request.status} />
            </div>
            <p className="text-[17px]">{nextStepText(request.status, "resident")}</p>
        </header>

        {notice && <Alert variant={notice.kind}>{notice.text}</Alert>}
        {request.allowedActions.includes("report_missed") && <Alert variant="warning">
            Your action is needed: confirm the collection or report a missed pickup.
        </Alert>}
        <RequestActions request={request} renderers={actionRenderers} />

        <section aria-labelledby="details-heading" className={cardStyle}>
            <h2 id="details-heading" className={cardTitle}>Details</h2>
            <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
                <div><dt className="text-[13px] text-neutral-700">Estimated weight</dt><dd>{request.estimatedWeightKg.toFixed(2)} kg</dd></div>
                <div><dt className="text-[13px] text-neutral-700">Created</dt><dd>{formatTimestamp(request.createdAt)}</dd></div>
                {request.status === "Open" && <div><dt className="text-[13px] text-neutral-700">Expires</dt><dd>{formatTimestamp(request.expiresAt)}</dd></div>}
            </dl>
        </section>

        <section aria-labelledby="windows-heading" className={cardStyle}>
            <h2 id="windows-heading" className={cardTitle}>Pickup windows</h2>
            <WindowList windows={request.windows} />
            <p className="text-[13px] text-neutral-700">Windows and times are Calgary time.</p>
        </section>

        {request.photoUrl && <section aria-labelledby="item-photo-heading" className={cardStyle}>
            <h2 id="item-photo-heading" className={cardTitle}>Photo</h2>
            <div className="max-w-xs"><RequestPhoto src={request.photoUrl} alt="Photo of the items" refetch={onPhotoError} /></div>
        </section>}

        {(request.address || request.notes) && <section aria-labelledby="address-heading" className={`${cardStyle} bg-accent-200!`}>
            <h2 id="address-heading" className={cardTitle}>Pickup address and notes</h2>
            {request.address && <div className="break-words">
                <p>{request.address.street}</p>
                <p>Calgary, {request.address.postalCode}</p>
            </div>}
            {request.notes && <p className="whitespace-pre-wrap break-words"><span className="text-neutral-800">Notes:</span> {request.notes}</p>}
        </section>}

        {request.assignment && <section aria-labelledby="volunteer-heading" className={cardStyle}>
            <h2 id="volunteer-heading" className={cardTitle}>Volunteer</h2>
            <Link href={`/profiles/${encodeURIComponent(request.assignment.volunteer.accountId)}`} className={`${textLink} max-w-full font-semibold`}>
                <span className="min-w-0 break-words">{request.assignment.volunteer.publicName}</span>
            </Link>
            <h3 className="text-lg">Selected pickup window</h3>
            <WindowList windows={[request.assignment.window]} />
            {request.assignment.collectedAt && <p>Collected {formatTimestamp(request.assignment.collectedAt)}</p>}
        </section>}

        {request.delivery && <section aria-labelledby="delivery-heading" className={cardStyle}>
            <h2 id="delivery-heading" className={cardTitle}>Delivery</h2>
            <p className="break-words">{request.delivery.facility.name}</p>
            <p>Delivered {formatTimestamp(request.delivery.deliveredAt)}</p>
            {request.delivery.evidencePhotoUrl && <div className="max-w-xs">
                <RequestPhoto src={request.delivery.evidencePhotoUrl} alt="Delivery photo" refetch={onPhotoError} />
            </div>}
        </section>}
        <StatusHistory statusHistory={request.statusHistory} rescheduledFrom={request.rescheduledFrom} rescheduledAs={request.rescheduledAs} />
    </>;
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Alert, LoadingRegion, QueryError, RequestPhoto, WindowList, actionGroup, card, identifier, pageTitle, textLink } from "@/components/ui";
import { NextStepPanel } from "@/components/ui/next-step-panel";
import { isAuthError } from "@/lib/api";
import { formatPostalCode } from "@/lib/postal-code";
import { formatTimestamp, formatWindow, friendlyWindow } from "@/lib/time";
import type { PickupWindow, RequestDetail } from "@/lib/types";
import { useRequestDetail } from "@/lib/use-request";
import AcceptRequest from "./accept-request";
import CancelAssignment from "./cancel-assignment";
import { EligibleFacilities } from "./facility-picker";
import RecordDelivery from "./record-delivery";

const cardStyle = `${card} min-w-0 space-y-3`;
const cardTitle = "text-title";

// The main task first and cancelling last, so the main one stays in view on a phone
const actions = [
    { action: "accept", Control: AcceptRequest },
    { action: "record_delivery", Control: RecordDelivery },
    { action: "cancel_assignment", Control: CancelAssignment },
] as const;

function Windows({ windows }: { windows: PickupWindow[] }) {
    return <ul className="space-y-1">
        {windows.map((window, index) => <li key={`${window.date}-${window.startHour}-${index}`}>
            <strong>{friendlyWindow(window)}</strong><br />
            <span className="text-caption text-text-muted">{formatWindow(window)}</span>
        </li>)}
    </ul>;
}

// What a volunteer most wants to know about the request, at the top of the page
function VolunteerStatusFacts({ request }: { request: RequestDetail }) {
    const { status, assignment, delivery, resident, expiresAt, windows, estimatedWeightKg, postalCode, address } = request;
    if (status === "Open") {
        return <div className="space-y-2 text-small">
            <p><strong className="font-semibold">Estimated weight</strong> <span className="tabular-nums">{estimatedWeightKg.toFixed(2)} kg</span></p>
            <p><strong className="font-semibold">Postal code</strong> <span className={identifier}>{formatPostalCode(postalCode)}</span></p>
            <div className="space-y-1">
                <p className="font-semibold">Pickup windows offered</p>
                <WindowList windows={windows} />
            </div>
            <p><strong className="font-semibold">Open until</strong> <time dateTime={expiresAt}>{formatTimestamp(expiresAt)}</time></p>
        </div>;
    }
    if ((status === "Assigned" || status === "Collected") && assignment) {
        return <div className="space-y-1 text-small">
            {resident && <p className="break-words"><strong className="font-semibold">Resident</strong>{" "}
                <Link href={`/profiles/${encodeURIComponent(resident.accountId)}`} className={textLink}>{resident.publicName}</Link>
            </p>}
            {status === "Assigned" && <p><strong className="font-semibold">Selected window</strong> {friendlyWindow(assignment.window)}</p>}
            {status === "Assigned" && address && <p className="text-text-muted">The pickup address is shown below.</p>}
            {status === "Collected" && assignment.collectedAt && <p><strong className="font-semibold">Collected</strong> <time dateTime={assignment.collectedAt}>{formatTimestamp(assignment.collectedAt)}</time></p>}
        </div>;
    }
    if (status === "Delivered" && delivery) {
        return <div className="space-y-1 text-small">
            <p className="break-words"><strong className="font-semibold">Facility</strong> {delivery.facility.name}</p>
            <p><strong className="font-semibold">Delivered</strong> <time dateTime={delivery.deliveredAt}>{formatTimestamp(delivery.deliveredAt)}</time></p>
        </div>;
    }
    return null;
}

export default function VolunteerRequestDetail({ requestId }: { requestId: string }) {
    const { data: request, isPending, isError, unavailable, error, refetch, isFetching } = useRequestDetail(requestId);
    // What the last action did, shown above the buttons
    const [notice, setNotice] = useState("");
    const noticeRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (notice) noticeRef.current?.focus();
    }, [notice]);
    const back = <Link href="/volunteer" className={textLink}>Back to available requests</Link>;

    if (unavailable) return <section className="space-y-3">
        <h1 className={pageTitle}>This request is no longer available</h1>
        {back}
    </section>;
    if (isPending) return <LoadingRegion label="Loading the request..." />;
    if (isError || !request) return <section className="space-y-3">
        <h1 className={pageTitle}>Pickup request</h1>
        <QueryError message={isAuthError(error)
            ? "You are not allowed to see this request. Please log in again as a volunteer."
            : "We could not load this request. Please try again."} onRetry={() => void refetch()} busy={isFetching} />
        {back}
    </section>;

    const buttons = actions.filter(({ action }) => request.allowedActions.includes(action));
    const assignment = request.assignment;

    const side = Boolean(assignment || request.photoUrl);

    return <>
        {back}
        <NextStepPanel title={`${request.quantity} × ${request.category.name}`} status={request.status} viewer="volunteer" quiet={Boolean(notice)}
            facts={<VolunteerStatusFacts request={request} />}
            notices={<>
                {notice && <div ref={noticeRef} tabIndex={-1} className="outline-none"><Alert variant="success">{notice}</Alert></div>}
                {request.viewer === "owner" && <Alert variant="info">This is your own request. You can accept it like any other volunteer.</Alert>}
            </>}
            actions={buttons.length > 0 && <section aria-label="Request actions" className={actionGroup}>
                {buttons.map(({ action, Control }) => <Control key={action} request={request} onDone={setNotice} />)}
            </section>}
        />

        <div className={`grid min-w-0 items-start gap-6 ${side ? "lg:grid-cols-[minmax(0,1fr)_340px]" : ""}`}>
            <div className="min-w-0 space-y-6">
                {request.status !== "Open" && <section aria-labelledby="details-heading" className={cardStyle}>
                    <h2 id="details-heading" className={cardTitle}>Details</h2>
                    <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
                        <div><dt className="text-caption text-text-muted">Estimated weight</dt><dd className="tabular-nums">{request.estimatedWeightKg.toFixed(2)} kg</dd></div>
                        <div><dt className="text-caption text-text-muted">Postal code</dt><dd className={identifier}>{formatPostalCode(request.postalCode)}</dd></div>
                    </dl>
                    <div className="space-y-2 border-t border-border pt-3">
                        <h3>Pickup windows</h3>
                        <Windows windows={request.windows} />
                        <p className="text-caption text-text-muted">Times are Calgary time.</p>
                    </div>
                </section>}

                {(request.address || request.notes) && <section aria-labelledby="address-heading" className={`${cardStyle} border-l-4 border-l-accent-2-700`}>
                    <h2 id="address-heading" className={cardTitle}>Pickup address and notes</h2>
                    {request.address && <div className="break-words">
                        <p>{request.address.street}</p>
                        <p>Calgary, <span className={identifier}>{formatPostalCode(request.address.postalCode)}</span></p>
                    </div>}
                    {request.notes && <p className="whitespace-pre-wrap break-words"><span className="text-text-muted">Notes:</span> {request.notes}</p>}
                </section>}

                {(request.status === "Assigned" || request.status === "Collected") && assignment && (
                    <section aria-labelledby="facilities-heading" className={cardStyle}>
                        <h2 id="facilities-heading" className={cardTitle}>Eligible recycling facilities</h2>
                        <p className="text-small text-text-muted">
                            Drop off {request.category.name} at any eligible location below, then record your delivery with a photo.
                        </p>
                        <EligibleFacilities categoryId={request.category.categoryId} />
                    </section>
                )}

                {request.delivery && <section aria-labelledby="delivery-heading" className={cardStyle}>
                    <h2 id="delivery-heading" className={cardTitle}>Delivery</h2>
                    <p className="break-words">{request.delivery.facility.name}</p>
                    <p>Delivered {formatTimestamp(request.delivery.deliveredAt)}</p>
                    {request.delivery.evidencePhotoUrl && <div className="max-w-xs">
                        <RequestPhoto src={request.delivery.evidencePhotoUrl} alt="Delivery photo" refetch={() => void refetch()} />
                    </div>}
                    <Link href="/ecopoints" className={textLink}>See my EcoPoints</Link>
                </section>}
            </div>

            {side && <div className="min-w-0 space-y-6">
                {assignment && <section aria-labelledby="assignment-heading" className={cardStyle}>
                    <h2 id="assignment-heading" className={cardTitle}>Your pickup</h2>
                    <p>Accepted {formatTimestamp(assignment.acceptedAt)}</p>
                    <h3>Selected pickup window</h3>
                    <Windows windows={[assignment.window]} />
                    {assignment.collectedAt && <p>Collected {formatTimestamp(assignment.collectedAt)}</p>}
                    {assignment.status === "Active" && <p className="text-text-muted">After you collect the items, the resident confirms the collection.</p>}
                </section>}

                {request.photoUrl && <section aria-labelledby="photo-heading" className={cardStyle}>
                    <h2 id="photo-heading" className={cardTitle}>Photo</h2>
                    <div className="max-w-xs"><RequestPhoto src={request.photoUrl} alt="Photo of the items" refetch={() => void refetch()} /></div>
                </section>}
            </div>}
        </div>
    </>;
}

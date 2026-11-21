"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, QueryError, RequestPhoto, Spinner, StatusBadge, card, pageTitle, panel, textLink } from "@/components/ui";
import { isAuthError } from "@/lib/api";
import { formatPostalCode } from "@/lib/postal-code";
import { nextStepText } from "@/lib/status-text";
import { formatTimestamp, formatWindow, friendlyWindow } from "@/lib/time";
import type { PickupWindow } from "@/lib/types";
import { useRequestDetail } from "@/lib/use-request";
import AcceptRequest from "./accept-request";
import CancelAssignment from "./cancel-assignment";
import RecordDelivery from "./record-delivery";

const cardStyle = `${card} min-w-0 space-y-3`;
const cardTitle = "text-[22px]";

const actions = [
    { action: "accept", Control: AcceptRequest },
    { action: "cancel_assignment", Control: CancelAssignment },
    { action: "record_delivery", Control: RecordDelivery },
] as const;

function Windows({ windows }: { windows: PickupWindow[] }) {
    return <ul className="space-y-1">
        {windows.map((window, index) => <li key={`${window.date}-${window.startHour}-${index}`}>
            <strong>{friendlyWindow(window)}</strong><br />
            <span className="text-[13px] text-text-muted">{formatWindow(window)}</span>
        </li>)}
    </ul>;
}

export default function VolunteerRequestDetail({ requestId }: { requestId: string }) {
    const { data: request, isPending, isError, unavailable, error, refetch, isFetching } = useRequestDetail(requestId);
    // What the last action did, shown above the buttons
    const [notice, setNotice] = useState("");
    const back = <Link href="/volunteer" className={textLink}>Back to available requests</Link>;

    if (unavailable) return <section className="space-y-3">
        <h1 className={pageTitle}>This request is no longer available</h1>
        {back}
    </section>;
    if (isPending) return <Spinner label="Loading the request..." />;
    if (isError || !request) return <section className="space-y-3">
        <h1 className={pageTitle}>Pickup request</h1>
        <QueryError message={isAuthError(error)
            ? "You are not allowed to see this request. Please log in again as a volunteer."
            : "We could not load this request. Please try again."} onRetry={() => void refetch()} busy={isFetching} />
        {back}
    </section>;

    const buttons = actions.filter(({ action }) => request.allowedActions.includes(action));
    const assignment = request.assignment;

    return <>
        {back}
        <header className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
                <h1 className={`break-words ${pageTitle}`}>{request.quantity} × {request.category.name}</h1>
                <StatusBadge status={request.status} />
            </div>
            <p className="text-[17px]"><span className="font-semibold">What happens next:</span> {nextStepText(request.status, "volunteer")}</p>
        </header>

        {notice && <Alert variant="success">{notice}</Alert>}
        {request.viewer === "owner" && <Alert variant="info">This is your own request. You can accept it like any other volunteer.</Alert>}
        {request.allowedActions.includes("record_delivery") && <Alert variant="info">Your action is needed: record the delivery.</Alert>}
        {buttons.length > 0 && <section aria-label="Request actions" className="flex flex-wrap gap-3">
            {buttons.map(({ action, Control }) => <Control key={action} request={request} onDone={setNotice} />)}
        </section>}

        <section aria-labelledby="details-heading" className={cardStyle}>
            <h2 id="details-heading" className={cardTitle}>Details</h2>
            <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
                <div><dt className="text-[13px] text-text-muted">Category</dt><dd className="break-words">{request.category.name}</dd></div>
                <div><dt className="text-[13px] text-text-muted">Quantity</dt><dd>{request.quantity}</dd></div>
                <div><dt className="text-[13px] text-text-muted">Estimated weight</dt><dd>{request.estimatedWeightKg.toFixed(2)} kg</dd></div>
                <div><dt className="text-[13px] text-text-muted">Postal code</dt><dd>{formatPostalCode(request.postalCode)}</dd></div>
                {request.status === "Open" && <div><dt className="text-[13px] text-text-muted">Open until</dt><dd>{formatTimestamp(request.expiresAt)}</dd></div>}
            </dl>
        </section>

        <section aria-labelledby="windows-heading" className={cardStyle}>
            <h2 id="windows-heading" className={cardTitle}>Pickup windows</h2>
            <Windows windows={request.windows} />
            <p className="text-[13px] text-text-muted">Times are Calgary time.</p>
        </section>

        {request.photoUrl && <section aria-labelledby="photo-heading" className={cardStyle}>
            <h2 id="photo-heading" className={cardTitle}>Photo</h2>
            <div className="max-w-xs"><RequestPhoto src={request.photoUrl} alt="Photo of the items" refetch={() => void refetch()} /></div>
        </section>}

        {(request.address || request.notes) && <section aria-labelledby="address-heading" className={`${panel} min-w-0 space-y-3 border-border bg-accent-200`}>
            <h2 id="address-heading" className={cardTitle}>Pickup address and notes</h2>
            {request.address && <div className="break-words">
                <p>{request.address.street}</p>
                <p>Calgary, {formatPostalCode(request.address.postalCode)}</p>
            </div>}
            {request.notes && <p className="whitespace-pre-wrap break-words"><span className="text-neutral-800">Notes:</span> {request.notes}</p>}
        </section>}

        {request.resident && <section aria-labelledby="resident-heading" className={cardStyle}>
            <h2 id="resident-heading" className={cardTitle}>Resident</h2>
            <Link href={`/profiles/${encodeURIComponent(request.resident.accountId)}`} className={`break-words ${textLink}`}>{request.resident.publicName}</Link>
        </section>}

        {assignment && <section aria-labelledby="assignment-heading" className={cardStyle}>
            <h2 id="assignment-heading" className={cardTitle}>Your pickup</h2>
            <p>Accepted {formatTimestamp(assignment.acceptedAt)}</p>
            <h3 className="text-lg">Selected pickup window</h3>
            <Windows windows={[assignment.window]} />
            {assignment.collectedAt && <p>Collected {formatTimestamp(assignment.collectedAt)}</p>}
            {assignment.status === "Active" && <p className="text-neutral-800">Waiting for the resident to confirm collection.</p>}
        </section>}

        {request.delivery && <section aria-labelledby="delivery-heading" className={cardStyle}>
            <h2 id="delivery-heading" className={cardTitle}>Delivery</h2>
            <p className="break-words">{request.delivery.facility.name}</p>
            <p>Delivered {formatTimestamp(request.delivery.deliveredAt)}</p>
            {request.delivery.evidencePhotoUrl && <div className="max-w-xs">
                <RequestPhoto src={request.delivery.evidencePhotoUrl} alt="Delivery photo" refetch={() => void refetch()} />
            </div>}
            <Link href="/ecopoints" className={textLink}>See my EcoPoints</Link>
        </section>}
    </>;
}

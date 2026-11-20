"use client";

import Link from "next/link";
import { Alert, Button, RequestPhoto, Spinner, StatusBadge, card, pageTitle, textLink } from "@/components/ui";
import { isAuthError } from "@/lib/api";
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
            <span className="text-[13px] text-neutral-700">{formatWindow(window)}</span>
        </li>)}
    </ul>;
}

export default function VolunteerRequestDetail({ requestId }: { requestId: string }) {
    const { data: request, isPending, isError, unavailable, error, refetch, isFetching } = useRequestDetail(requestId);
    const back = <Link href="/volunteer" className={textLink}>Back to available requests</Link>;

    if (unavailable) return <section className="space-y-3">
        <h1 className={pageTitle}>This request is no longer available</h1>
        {back}
    </section>;
    if (isPending) return <Spinner label="Loading the request..." />;
    if (isError || !request) return <section className="space-y-3">
        <h1 className={pageTitle}>Pickup request</h1>
        <Alert variant="error">{isAuthError(error)
            ? "You are not allowed to see this request. Please log in again as a volunteer."
            : "We could not load this request. Please try again."}</Alert>
        <div><Button variant="secondary" onClick={() => void refetch()} busy={isFetching} busyLabel="Trying...">Try again</Button></div>
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

        {request.allowedActions.includes("record_delivery") && <Alert variant="info">Your action is needed: record the delivery.</Alert>}
        {buttons.length > 0 && <section aria-label="Request actions" className="flex flex-wrap gap-3">
            {buttons.map(({ action, Control }) => <Control key={action} request={request} />)}
        </section>}

        <section aria-labelledby="details-heading" className={cardStyle}>
            <h2 id="details-heading" className={cardTitle}>Details</h2>
            <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
                <div><dt className="text-[13px] text-neutral-700">Category</dt><dd className="break-words">{request.category.name}</dd></div>
                <div><dt className="text-[13px] text-neutral-700">Quantity</dt><dd>{request.quantity}</dd></div>
                <div><dt className="text-[13px] text-neutral-700">Estimated weight</dt><dd>{request.estimatedWeightKg.toFixed(2)} kg</dd></div>
                <div><dt className="text-[13px] text-neutral-700">Postal code</dt><dd>{request.postalCode}</dd></div>
                {request.resident && <div><dt className="text-[13px] text-neutral-700">Resident</dt><dd className="break-words">{request.resident.publicName}</dd></div>}
            </dl>
        </section>

        <section aria-labelledby="windows-heading" className={cardStyle}>
            <h2 id="windows-heading" className={cardTitle}>Pickup windows</h2>
            <Windows windows={request.windows} />
            <p className="text-[13px] text-neutral-700">Times are Calgary time.</p>
        </section>

        {request.photoUrl && <section aria-labelledby="photo-heading" className={cardStyle}>
            <h2 id="photo-heading" className={cardTitle}>Photo</h2>
            <div className="max-w-xs"><RequestPhoto src={request.photoUrl} alt="Photo of the items" refetch={() => void refetch()} /></div>
        </section>}

        {(request.address || request.notes) && <section aria-labelledby="address-heading" className={`${cardStyle} bg-accent-200!`}>
            <h2 id="address-heading" className={cardTitle}>Pickup address and notes</h2>
            {request.address && <div className="break-words">
                <p>{request.address.street}</p>
                <p>Calgary, {request.address.postalCode}</p>
            </div>}
            {request.notes && <p className="whitespace-pre-wrap break-words"><span className="text-neutral-800">Notes:</span> {request.notes}</p>}
        </section>}

        {assignment && <section aria-labelledby="assignment-heading" className={cardStyle}>
            <h2 id="assignment-heading" className={cardTitle}>Your pickup</h2>
            <p>Accepted {formatTimestamp(assignment.acceptedAt)}</p>
            <h3 className="text-lg">Selected pickup window</h3>
            <Windows windows={[assignment.window]} />
            {assignment.collectedAt && <p>Collected {formatTimestamp(assignment.collectedAt)}</p>}
        </section>}
    </>;
}

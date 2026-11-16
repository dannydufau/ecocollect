"use client";

import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { RequestPhoto } from "@/components/ui/request-photo";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { WindowList } from "@/components/ui/window-list";
import { isAuthError } from "@/lib/api";
import { nextStepText } from "@/lib/status-text";
import { formatTimestamp } from "@/lib/time";
import type { RequestDetail } from "@/lib/types";
import { useRequestDetail } from "@/lib/use-request";
import { RequestActions, type ResidentActionRenderers } from "./request-actions";
import StatusHistory from "./status-history";

const linkStyle = "inline-flex min-h-11 items-center rounded-lg px-1 text-[#8c491a] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2";
const cardStyle = "min-w-0 space-y-3 rounded-2xl border border-stone-300 bg-white p-4 sm:p-6";

function UnavailableRequest() {
    return <section className="space-y-3">
        <h1 className="text-2xl font-semibold">This request is no longer available.</h1>
        <Link href="/resident" className={linkStyle}>Back to my requests</Link>
    </section>;
}

export default function ResidentRequestDetail({ requestId, actionRenderers }: {
    requestId: string;
    actionRenderers?: ResidentActionRenderers;
}) {
    const { data, isPending, isError, unavailable, error, refetch, isFetching } = useRequestDetail(requestId);
    if (unavailable || (data && data.viewer !== "owner")) return <UnavailableRequest />;
    if (isPending) return <Spinner label="Loading your request..." />;
    if (isError || !data) return <section className="space-y-3">
        <h1 className="text-2xl font-semibold">Pickup request</h1>
        <Alert variant="error">{isAuthError(error)
            ? "You are not allowed to see this request. Please log in again as a resident."
            : "We could not load your request. Please try again."}</Alert>
        {!isAuthError(error) && <button type="button" onClick={() => void refetch()} disabled={isFetching}
            className="min-h-11 rounded-lg border border-stone-400 px-4 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">
            {isFetching ? "Trying..." : "Try again"}
        </button>}
        <Link href="/resident" className={linkStyle}>Back to my requests</Link>
    </section>;

    return <ResidentRequestView request={data} onPhotoError={() => { void refetch(); }} actionRenderers={actionRenderers} />;
}

export function ResidentRequestView({ request, onPhotoError, actionRenderers }: {
    request: RequestDetail;
    onPhotoError: () => void;
    actionRenderers?: ResidentActionRenderers;
}) {
    if (request.viewer !== "owner") return <UnavailableRequest />;

    return <>
        <Link href="/resident" className={linkStyle}>Back to my requests</Link>
        <header className="min-w-0 space-y-3">
            <h1 className="break-words text-2xl font-semibold sm:text-3xl">{request.category.name}</h1>
            <StatusBadge status={request.status} />
            <p>{nextStepText(request.status, "resident")}</p>
            <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
                <div><dt className="text-stone-600">Quantity</dt><dd>{request.quantity}</dd></div>
                <div><dt className="text-stone-600">Estimated weight</dt><dd>{request.estimatedWeightKg.toFixed(2)} kg</dd></div>
                <div><dt className="text-stone-600">Created</dt><dd>{formatTimestamp(request.createdAt)}</dd></div>
            </dl>
        </header>

        {request.allowedActions.includes("report_missed") && <Alert variant="warning">
            Your action is needed: confirm the collection or report a missed pickup.
        </Alert>}
        <RequestActions request={request} renderers={actionRenderers} />
        <StatusHistory statusHistory={request.statusHistory} rescheduledFrom={request.rescheduledFrom} rescheduledAs={request.rescheduledAs} />

        <section aria-labelledby="pickup-details-heading" className={cardStyle}>
            <h2 id="pickup-details-heading" className="text-lg font-semibold">Pickup details</h2>
            <p className="text-sm text-stone-600">Times are Calgary time.</p>
            <h3 className="font-medium">Pickup windows</h3>
            <WindowList windows={request.windows} />
            {request.status === "Open" && <p className="text-sm">Expires {formatTimestamp(request.expiresAt)}</p>}
            {request.address && <div className="break-words">
                <h3 className="font-medium">Pickup address</h3>
                <p>{request.address.street}</p>
                <p>Calgary, {request.address.postalCode}</p>
            </div>}
            {request.notes && <div>
                <h3 className="font-medium">Notes</h3>
                <p className="whitespace-pre-wrap break-words">{request.notes}</p>
            </div>}
        </section>

        {request.photoUrl && <section aria-labelledby="item-photo-heading" className={cardStyle}>
            <h2 id="item-photo-heading" className="text-lg font-semibold">Item photo</h2>
            <div className="max-w-xl"><RequestPhoto src={request.photoUrl} alt="Item photo" refetch={onPhotoError} /></div>
        </section>}

        {request.assignment && <section aria-labelledby="volunteer-heading" className={cardStyle}>
            <h2 id="volunteer-heading" className="text-lg font-semibold">Volunteer</h2>
            <Link href={`/profiles/${encodeURIComponent(request.assignment.volunteer.accountId)}`} className={`${linkStyle} max-w-full`}>
                <span className="min-w-0 break-words">{request.assignment.volunteer.publicName}</span>
            </Link>
            <h3 className="font-medium">Selected pickup window</h3>
            <WindowList windows={[request.assignment.window]} />
            {request.assignment.collectedAt && <p className="text-sm">Collected {formatTimestamp(request.assignment.collectedAt)}</p>}
        </section>}

        {request.delivery && <section aria-labelledby="delivery-heading" className={cardStyle}>
            <h2 id="delivery-heading" className="text-lg font-semibold">Delivery</h2>
            <p className="break-words">{request.delivery.facility.name}</p>
            <p className="text-sm">Delivered {formatTimestamp(request.delivery.deliveredAt)}</p>
            {request.delivery.evidencePhotoUrl && <div className="max-w-xl">
                <h3 className="mb-2 font-medium">Delivery evidence photo</h3>
                <RequestPhoto src={request.delivery.evidencePhotoUrl} alt="Delivery evidence photo" refetch={onPhotoError} />
            </div>}
        </section>}
    </>;
}

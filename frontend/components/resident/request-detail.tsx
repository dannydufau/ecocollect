"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, LoadingRegion, QueryError, RequestPhoto, StatusBadge, WindowList, card, pageTitle, secondaryLinkButton, textLink } from "@/components/ui";
import { isAuthError } from "@/lib/api";
import { formatPostalCode } from "@/lib/postal-code";
import { nextStepText } from "@/lib/status-text";
import { formatTimestamp } from "@/lib/time";
import type { RequestDetail } from "@/lib/types";
import { useRequestDetail } from "@/lib/use-request";
import CancelAssignment from "./cancel-assignment";
import CancelRequest, { type Notice } from "./cancel-request";
import ConfirmCollected from "./confirm-collected";
import ReportMissed from "./report-missed";
import { RequestActions, type ResidentActionRenderers } from "./request-actions";
import StatusHistory from "./status-history";

const cardStyle = `${card} min-w-0 space-y-3`;
const cardTitle = "text-title";
const part = "py-4 first:pt-0 last:pb-0";

function UnavailableRequest() {
    return <section className="space-y-3">
        <h1 className={pageTitle}>This request is no longer available.</h1>
        <Link href="/resident" className={textLink}>Back to my requests</Link>
    </section>;
}

export default function ResidentRequestDetail({ requestId, rescheduled = false, actionRenderers }: {
    requestId: string;
    rescheduled?: boolean;
    actionRenderers?: ResidentActionRenderers;
}) {
    const { data, isPending, isError, unavailable, error, refetch, isFetching } = useRequestDetail(requestId);
    const [notice, setNotice] = useState<Notice | null>(rescheduled ? { kind: "success", text: "Missed pickup reported. Your new request is open." } : null);
    if (unavailable || (data && data.viewer !== "owner")) return <UnavailableRequest />;
    if (isPending) return <LoadingRegion label="Loading your request..." />;
    if (isError || !data) return <section className="space-y-3">
        <h1 className={pageTitle}>Pickup request</h1>
        {isAuthError(error)
            ? <Alert variant="error">You are not allowed to see this request. Please log in again as a resident.</Alert>
            : <QueryError message="We could not load your request. Please try again." onRetry={() => void refetch()} busy={isFetching} />}
        <Link href="/resident" className={textLink}>Back to my requests</Link>
    </section>;

    // The cancel button goes in with the other actions, so they all sit in one group
    const renderers: ResidentActionRenderers = {
        edit: request => <Link href={`/resident/requests/${encodeURIComponent(request.requestId)}/edit`}
            className={secondaryLinkButton}>Edit request</Link>,
        cancel: request => <CancelRequest request={request} onNotice={setNotice} />,
        confirm_collected: request => <ConfirmCollected request={request} onNotice={setNotice} />,
        cancel_assignment: request => <CancelAssignment request={request} onNotice={setNotice} />,
        report_missed: request => <ReportMissed request={request} onNotice={setNotice} />,
        ...actionRenderers,
    };
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

        {/* The page order is the phone order. On wide screens the grid puts the summary first on the left. */}
        <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr]">
            {(request.assignment || request.delivery) && <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-start-2">
                {request.assignment && <section aria-labelledby="volunteer-heading" className={cardStyle}>
                    <h2 id="volunteer-heading" className={cardTitle}>Volunteer</h2>
                    <Link href={`/profiles/${encodeURIComponent(request.assignment.volunteer.accountId)}`} className={`${textLink} max-w-full font-semibold`}>
                        <span className="min-w-0 break-words">{request.assignment.volunteer.publicName}</span>
                    </Link>
                    <h3>Selected pickup window</h3>
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
            </div>}

            <section aria-labelledby="summary-heading" className={`${cardStyle} lg:col-start-1 lg:row-start-1`}>
                <h2 id="summary-heading" className={cardTitle}>Summary</h2>
                <div className="divide-y divide-border">
                    <dl className={`${part} grid gap-x-4 gap-y-3 sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]`}>
                        <div><dt className="text-[13px] text-text-muted">Estimated weight</dt><dd className="tabular-nums">{request.estimatedWeightKg.toFixed(2)} kg</dd></div>
                        <div><dt className="text-[13px] text-text-muted">Created</dt><dd>{formatTimestamp(request.createdAt)}</dd></div>
                        {request.status === "Open" && <div><dt className="text-[13px] text-text-muted">Expires</dt><dd>{formatTimestamp(request.expiresAt)}</dd></div>}
                    </dl>
                    <div className={`${part} space-y-2`}>
                        <h3>Pickup windows</h3>
                        <WindowList windows={request.windows} />
                        <p className="text-[13px] text-text-muted">Windows and times are Calgary time.</p>
                    </div>
                    {(request.address || request.notes) && <div className={`${part} space-y-2`}>
                        <h3>Pickup address and notes</h3>
                        {request.address && <div className="break-words">
                            <p>{request.address.street}</p>
                            <p>Calgary, {formatPostalCode(request.address.postalCode)}</p>
                        </div>}
                        {request.notes && <p className="whitespace-pre-wrap break-words rounded-xl bg-surface p-3 text-sm"><span className="font-semibold">Notes:</span> {request.notes}</p>}
                    </div>}
                    {request.photoUrl && <div className={`${part} space-y-2`}>
                        <h3>Photo</h3>
                        <div className="max-w-xs"><RequestPhoto src={request.photoUrl} alt="Photo of the items" refetch={onPhotoError} /></div>
                    </div>}
                </div>
            </section>

            <div className="min-w-0 space-y-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
                <StatusHistory statusHistory={request.statusHistory} rescheduledFrom={request.rescheduledFrom} rescheduledAs={request.rescheduledAs} />
            </div>
        </div>
    </>;
}

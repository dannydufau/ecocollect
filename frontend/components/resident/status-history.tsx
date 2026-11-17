import Link from "next/link";
import { StatusBadge, card, textLink } from "@/components/ui";
import { formatTimestamp } from "@/lib/time";
import type { RequestDetail } from "@/lib/types";

const cardStyle = `${card} min-w-0 space-y-3`;

export default function StatusHistory({ statusHistory = [], rescheduledFrom, rescheduledAs }: Pick<RequestDetail,
    "statusHistory" | "rescheduledFrom" | "rescheduledAs">) {
    if (!statusHistory.length && !rescheduledFrom && !rescheduledAs) return null;
    const history = [...statusHistory].sort((a, b) => Date.parse(a.changedAt) - Date.parse(b.changedAt));

    return <>
        {(rescheduledFrom || rescheduledAs) && <section aria-labelledby="rescheduling-heading" className={cardStyle}>
            <h2 id="rescheduling-heading" className="text-[22px]">Rescheduling</h2>
            {rescheduledAs && <Link href={`/resident/requests/${encodeURIComponent(rescheduledAs.requestId)}`} className={textLink}>View the new request</Link>}
            {rescheduledFrom && <Link href={`/resident/requests/${encodeURIComponent(rescheduledFrom.requestId)}`} className={textLink}>Rescheduled from an earlier request</Link>}
        </section>}
        {history.length > 0 && <section aria-labelledby="status-history-heading" className={cardStyle}>
            <h2 id="status-history-heading" className="text-[22px]">History</h2>
            <ol className="space-y-4">
                {history.map((entry, index) => <li key={`${entry.changedAt}-${index}`} className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={entry.status} />
                        <time dateTime={entry.changedAt} className="text-neutral-700">{formatTimestamp(entry.changedAt)}</time>
                    </div>
                    {entry.reason && <p className="whitespace-pre-wrap break-words text-neutral-800">Reason: {entry.reason}</p>}
                </li>)}
            </ol>
        </section>}
    </>;
}

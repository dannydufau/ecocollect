import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatTimestamp } from "@/lib/time";
import type { RequestDetail } from "@/lib/types";

export default function StatusHistory({ statusHistory = [], rescheduledFrom, rescheduledAs }: Pick<RequestDetail,
    "statusHistory" | "rescheduledFrom" | "rescheduledAs">) {
    if (!statusHistory.length && !rescheduledFrom && !rescheduledAs) return null;
    const history = [...statusHistory].sort((a, b) => Date.parse(a.changedAt) - Date.parse(b.changedAt));
    const linkStyle = "inline-flex min-h-11 items-center rounded-lg px-1 text-[#8c491a] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2";

    return <section aria-labelledby="status-history-heading" className="min-w-0 space-y-3 rounded-2xl border border-stone-300 bg-white p-4 sm:p-6">
        <h2 id="status-history-heading" className="text-lg font-semibold">Status history</h2>
        {history.length > 0 && <>
            <p className="text-sm text-stone-600">Times are Calgary time. Oldest first.</p>
            <ol className="space-y-4">
                {history.map((entry, index) => <li key={`${entry.changedAt}-${index}`} className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={entry.status} />
                        <time dateTime={entry.changedAt} className="text-sm text-stone-700">{formatTimestamp(entry.changedAt)}</time>
                    </div>
                    {entry.reason && <p className="whitespace-pre-wrap break-words text-sm">{entry.reason}</p>}
                </li>)}
            </ol>
        </>}
        {(rescheduledFrom || rescheduledAs) && <nav aria-label="Rescheduled requests" className="flex flex-wrap gap-x-4 gap-y-2">
            {rescheduledFrom && <Link href={`/resident/requests/${encodeURIComponent(rescheduledFrom.requestId)}`} className={linkStyle}>Rescheduled from</Link>}
            {rescheduledAs && <Link href={`/resident/requests/${encodeURIComponent(rescheduledAs.requestId)}`} className={linkStyle}>Rescheduled as</Link>}
        </nav>}
    </section>;
}

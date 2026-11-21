type Status = "Open" | "Assigned" | "Collected" | "Delivered" | "Cancelled" | "Expired" | "Missed";

// The prototype's pill colors. White or pale text on the dark fills, dark text on the light ones.
const styles: Record<Status, string> = {
    Open: "bg-accent-2-200 text-accent-2-900",
    Assigned: "bg-accent-200 text-accent-900",
    Collected: "bg-accent-2-700 text-on-moss",
    Delivered: "bg-accent-2-900 text-on-moss",
    Cancelled: "bg-neutral-300 text-neutral-900",
    Expired: "bg-neutral-300 text-neutral-900",
    Missed: "bg-danger text-white",
};

const symbols: Record<Status, string> = {
    Open: "○", Assigned: "◐", Collected: "◕", Delivered: "✓",
    Cancelled: "✕", Expired: "–", Missed: "!",
};

export function StatusBadge({ status }: { status: Status }) {
    return (
        <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3.5 py-1 text-[13px] font-semibold ${styles[status]}`}>
            <span aria-hidden="true">{symbols[status]}</span>
            {status}
        </span>
    );
}

type Status = "Open" | "Assigned" | "Collected" | "Delivered" | "Cancelled" | "Expired" | "Missed";

const styles: Record<Status, string> = {
    Open: "border-amber-300 bg-amber-50 text-amber-900",
    Assigned: "border-sky-300 bg-sky-50 text-sky-900",
    Collected: "border-violet-300 bg-violet-50 text-violet-900",
    Delivered: "border-green-300 bg-green-50 text-green-900",
    Cancelled: "border-red-300 bg-red-50 text-red-900",
    Expired: "border-gray-300 bg-gray-100 text-gray-800",
    Missed: "border-orange-300 bg-orange-50 text-orange-900",
};

const symbols: Record<Status, string> = {
    Open: "○", Assigned: "◐", Collected: "◕", Delivered: "✓",
    Cancelled: "✕", Expired: "-", Missed: "!",
};

export function StatusBadge({ status }: { status: Status }) {
    return (
        <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium ${styles[status]}`}>
            <span aria-hidden="true">{symbols[status]}</span>
            {status}
        </span>
    );
}

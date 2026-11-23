import { CheckIcon, CircleHalfIcon, CircleIcon, CircleThreeQuartersIcon, CrossIcon, DashIcon, ExclamationIcon } from "./icons";
import { badge } from "./styles";

type Status = "Open" | "Assigned" | "Collected" | "Delivered" | "Cancelled" | "Expired" | "Missed"
    | "Active" | "Cancelled by me" | "Cancelled by resident";

// The prototype's pill colors. White or pale text on the dark fills, dark text on the light ones.
const styles: Record<Status, string> = {
    Open: "bg-accent-2-200 text-accent-2-900",
    Assigned: "bg-accent-200 text-accent-900",
    Collected: "bg-accent-2-700 text-on-moss",
    Delivered: "bg-accent-2-900 text-on-moss",
    Cancelled: "bg-neutral-300 text-text",
    Expired: "bg-neutral-300 text-text",
    Missed: "bg-danger text-on-danger",
    Active: "bg-accent-200 text-accent-900",
    "Cancelled by me": "bg-neutral-300 text-text",
    "Cancelled by resident": "bg-neutral-300 text-text",
};

const icons: Record<Status, typeof CircleIcon> = {
    Open: CircleIcon, Assigned: CircleHalfIcon, Collected: CircleThreeQuartersIcon, Delivered: CheckIcon,
    Cancelled: CrossIcon, Expired: DashIcon, Missed: ExclamationIcon,
    Active: CircleHalfIcon, "Cancelled by me": CrossIcon, "Cancelled by resident": CrossIcon,
};

export function StatusBadge({ status }: { status: Status }) {
    const Icon = icons[status];
    return (
        <span className={`${badge} ${styles[status]}`}>
            <Icon className="size-4 flex-none" />
            {status}
        </span>
    );
}

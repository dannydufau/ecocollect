import type { PickupWindow } from "@/lib/types";
import { formatWindow } from "@/lib/time";
import { CalendarIcon } from "./icons";

export function WindowList({ windows }: { windows: PickupWindow[] }) {
    return (
        <ul className="space-y-1 text-sm">
            {windows.map((window, index) => (
                <li key={`${window.date}-${window.startHour}-${index}`} className="flex items-start gap-2">
                    <CalendarIcon className="mt-0.5 size-4 flex-none text-text-muted" />
                    <span className="min-w-0">{formatWindow(window)}</span>
                </li>
            ))}
        </ul>
    );
}

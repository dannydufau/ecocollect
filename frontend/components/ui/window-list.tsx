import type { PickupWindow } from "@/lib/types";
import { formatWindow } from "@/lib/time";

export function WindowList({ windows }: { windows: PickupWindow[] }) {
    return (
        <ul className="list-inside list-disc space-y-1 text-sm">
            {windows.map((window, index) => (
                <li key={`${window.date}-${window.startHour}-${index}`}>{formatWindow(window)}</li>
            ))}
        </ul>
    );
}

import type { PickupWindow } from "@/lib/types";

const TZ = "America/Edmonton"; // Calgary

// UTC instant of a Calgary date + hour, e.g. ("2026-10-30", 14).
export function calgaryInstant(date: string, hour: number): Date {
    const [y, m, d] = date.split("-").map(Number);
    const guess = Date.UTC(y, m - 1, d, hour);
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-US", {
            timeZone: TZ,
            hourCycle: "h23",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
        })
            .formatToParts(new Date(guess))
            .map((p) => [p.type, p.value]),
    );
    const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour);
    return new Date(guess - (shown - guess));
}

// Today's date in Calgary as YYYY-MM-DD (for the date picker's min).
export function calgaryToday(): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

// "Oct 28, 2026, 10:15 a.m." in Calgary time, from a UTC timestamp.
// A value that isn't a real date is shown as it came, so one bad row can't break the whole list.
export function formatTimestamp(iso: string): string {
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) {
        return iso;
    }
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

// "Fri, Oct 30, 14:00 to 15:00". A date that isn't real is shown as it came, like formatTimestamp.
export function formatWindow(window: PickupWindow): string {
    if (Number.isNaN(new Date(`${window.date}T12:00:00Z`).getTime())) {
        return window.date;
    }
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" }).format(
        calgaryInstant(window.date, window.startHour),
    );
    return `${day}, ${formatHour(window.startHour)} to ${formatHour((window.startHour + 1) % 24)}`;
}

export function formatHour(hour: number): string {
    return `${String(hour).padStart(2, "0")}:00`;
}
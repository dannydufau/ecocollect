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

// A date in Calgary as YYYY-MM-DD, today by default (for the date picker's min and max).
export function calgaryToday(date = new Date()): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(date);
}

// The hour of the day in Calgary, 0 to 23
export function calgaryHour(): number {
    return Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
}

// "Oct 28, 2026, 10:15 a.m." in Calgary time, from a UTC timestamp.
// A value that can't be read as a date is shown as it came, so one bad row can't break the whole list.
export function formatTimestamp(iso: string): string {
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) {
        return iso;
    }
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

// A date with no time, like a birth date: "Mar 14, 1995". Read as UTC so the day can't shift.
export function formatDate(date: string): string {
    const parsed = new Date(`${date}T12:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return date;
    return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", dateStyle: "medium" }).format(parsed);
}

// A real calendar date like 2026-10-30. new Date() alone isn't enough, it quietly turns 2026-02-30 into Mar 2.
function isRealDate(date: string): boolean {
    const parsed = new Date(`${date}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
}

export function isValidWindow(window: PickupWindow): boolean {
    return isRealDate(window.date) && Number.isInteger(window.startHour) && window.startHour >= 0 && window.startHour <= 23;
}

// "Fri, Oct 30, 14:00 to 15:00". A window with a bad date or hour is shown as the date it came with, like formatTimestamp.
export function formatWindow(window: PickupWindow): string {
    if (!isValidWindow(window)) {
        return String(window.date);
    }

    const day = new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        weekday: "short",
        month: "short",
        day: "numeric",
    }).format(new Date(`${window.date}T12:00:00Z`));

    return `${day}, ${formatHour(window.startHour)} to ${formatHour((window.startHour + 1) % 24)}`;
}

export function formatHour(hour: number): string {
    return `${String(hour).padStart(2, "0")}:00`;
}

export function friendlyWindow(window: PickupWindow): string {
    const full = formatWindow(window);
    if (!isValidWindow(window)) {
        return full;
    }

    const today = calgaryToday();
    const tomorrow = new Date(`${today}T12:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const nextDate = tomorrow.toISOString().slice(0, 10);

    const label = window.date === today
        ? "Today"
        : window.date === nextDate
            ? "Tomorrow"
            : full.split(", ").slice(0, 2).join(", ");

    const start = window.startHour;
    const end = (start + 1) % 24;
    const clock = (hour: number) => hour % 12 || 12;
    const period = (hour: number) => hour < 12 ? "a.m." : "p.m.";

    const hours = period(start) === period(end)
        ? `${clock(start)} to ${clock(end)} ${period(end)}`
        : `${clock(start)} ${period(start)} to ${clock(end)} ${period(end)}`;

    return `${label}, ${hours}`;
}

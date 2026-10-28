const ZONE = "America/Edmonton";

function pad(n: number): string {
    return String(n).padStart(2, "0");
}

// A pickup window is a Calgary date plus a start hour, so there is no time zone to convert.
// The date is formatted as UTC noon only so the day can never shift.
// An invalid date is returned unchanged instead of throwing.
export function formatWindow(date: string, startHour: number): string {
    const parsed = new Date(`${date}T12:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
        return date;
    }
    const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: "UTC",
        weekday: "short",
        month: "short",
        day: "numeric",
    }).format(parsed);
    return `${day}, ${pad(startHour)}:00 to ${pad((startHour + 1) % 24)}:00`;
}

// A timestamp from the API is UTC. Show it in Calgary time.
// An invalid timestamp is returned unchanged instead of throwing.
export function formatCalgary(timestamp: string): string {
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) {
        return timestamp;
    }
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: ZONE,
        dateStyle: "medium",
        timeStyle: "short",
    }).format(parsed);
}

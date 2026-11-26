import { afterEach, describe, expect, it, vi } from "vitest";
import { calgaryHour, calgaryInstant, calgaryToday, formatDate, formatHour, formatWindow, friendlyWindow, isValidWindow } from "./time";

afterEach(() => { vi.useRealTimers(); });

describe("window formatting", () => {
    it("does not change the displayed hour across the March clock change", () => {
        expect(formatWindow({ date: "2026-01-15", startHour: 14 })).toBe("Thu, Jan 15, 14:00 to 15:00");
        expect(formatWindow({ date: "2026-04-15", startHour: 14 })).toBe("Wed, Apr 15, 14:00 to 15:00");
    });

    it("uses Calgary dates for Today and Tomorrow", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-11-15T05:00:00Z")); // Nov 14 in Calgary; Nov 15 in Tokyo
        expect(friendlyWindow({ date: "2026-11-14", startHour: 14 })).toBe("Today, 2 to 3 p.m.");
        expect(friendlyWindow({ date: "2026-11-15", startHour: 14 })).toBe("Tomorrow, 2 to 3 p.m.");
    });

    it("accepts only a real date and an hour from 0 to 23", () => {
        expect(isValidWindow({ date: "2026-11-14", startHour: 0 })).toBe(true);
        expect(isValidWindow({ date: "2026-11-14", startHour: 23 })).toBe(true);
        expect(isValidWindow({ date: "2026-02-30", startHour: 10 })).toBe(false);
        expect(isValidWindow({ date: "2026-11-14", startHour: 24 })).toBe(false);
        expect(isValidWindow({ date: "2026-11-14", startHour: 1.5 })).toBe(false);
    });

    it("reads the day and the hour in Calgary time", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-11-15T05:30:00Z")); // 22:30 on Nov 14 in Calgary
        expect(calgaryToday()).toBe("2026-11-14");
        expect(calgaryHour()).toBe(22);
        expect(calgaryToday(new Date("2026-12-14T20:00:00Z"))).toBe("2026-12-14");
    });

    it("formats a date with no time, and leaves a bad one as it came", () => {
        expect(formatDate("1995-03-14")).toBe("Mar 14, 1995");
        expect(formatDate("not a date")).toBe("not a date");
    });

    it("pads single-digit hours", () => {
        expect(formatHour(7)).toBe("07:00");
    });
});

describe("calgaryInstant", () => {
    // Formats the answer back in Calgary time, so the check does not use calgaryInstant itself
    const calgary = (instant: Date) => new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Edmonton", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", timeZoneName: "short",
    }).format(instant);

    it.each([
        ["2026-03-07", 3], ["2026-03-08", 1], ["2026-03-08", 3], ["2026-03-08", 10], ["2026-03-09", 3],
        ["2026-10-31", 2], ["2026-11-01", 2], ["2026-11-01", 10], ["2026-11-02", 2],
    ])("%s at %i:00 is that hour in Calgary", (date, hour) => {
        expect(calgary(calgaryInstant(date, hour))).toMatch(new RegExp(`^${date}, ${String(hour).padStart(2, "0")} `));
    });

    it("gives the earlier one of the hour that happens twice in November", () => {
        expect(calgary(calgaryInstant("2026-11-01", 1))).toBe("2026-11-01, 01 MDT");
        expect(calgaryInstant("2026-11-01", 1).toISOString()).toBe("2026-11-01T07:00:00.000Z");
    });
});

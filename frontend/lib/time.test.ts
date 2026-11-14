import { afterEach, describe, expect, it, vi } from "vitest";
import { formatWindow, friendlyWindow } from "./time";
import { nextStepText } from "./status-text";

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

    it("gives the resident the assigned status message", () => {
        expect(nextStepText("Assigned", "resident")).toBe(
            "A volunteer will collect your items in the selected window.",
        );
    });
});

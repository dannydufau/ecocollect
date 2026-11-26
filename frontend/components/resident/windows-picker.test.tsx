import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PickupWindow } from "@/lib/types";
import { WindowsPicker } from "./windows-picker";

function Picker({ onChange = vi.fn(), value = [] }: {
    onChange?: (windows: PickupWindow[]) => void;
    value?: PickupWindow[];
}) {
    const [windows, setWindows] = useState(value);
    return <WindowsPicker value={windows} onChange={next => { setWindows(next); onChange(next); }} />;
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-15T05:00:00Z"));
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe("WindowsPicker", () => {
    it("starts with one empty row and all 24 hours", () => {
        render(<Picker />);
        expect(screen.getByLabelText("Date 1")).toHaveValue("");
        expect(screen.getByLabelText("Start hour 1")).toHaveValue("");
        expect(screen.getByRole("option", { name: "00:00" })).toHaveValue("0");
        expect(screen.getByRole("option", { name: "23:00" })).toHaveValue("23");
        expect(screen.queryByRole("button", { name: "Remove window 1" })).not.toBeInTheDocument();
        expect(screen.getByLabelText("Date 1")).toHaveAttribute("min", "2026-11-14");
    });

    it("adds up to three rows and removes down to one", () => {
        render(<Picker />);
        const add = screen.getByRole("button", { name: "Add window" });
        fireEvent.click(add);
        fireEvent.click(add);
        fireEvent.click(add);
        expect(screen.getAllByRole("combobox")).toHaveLength(3);
        expect(add).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Remove window 2" }));
        fireEvent.click(screen.getByRole("button", { name: "Remove window 2" }));
        expect(screen.getAllByRole("combobox")).toHaveLength(1);
        expect(screen.queryByRole("button", { name: "Remove window 1" })).not.toBeInTheDocument();
    });

    it("sets Calgary dates, groups hours, and summarizes overnight windows", () => {
        vi.setSystemTime(new Date("2026-11-15T04:00:00Z"));
        render(<Picker />);
        fireEvent.click(screen.getByRole("button", { name: "Today" }));
        expect(screen.getByLabelText("Date 1")).toHaveValue("2026-11-14");
        expect(screen.getByRole("option", { name: "00:00" })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Tomorrow" }));
        expect(screen.getByLabelText("Date 1")).toHaveValue("2026-11-15");
        expect(screen.getAllByRole("group").filter(group => group.tagName === "OPTGROUP")
            .map(group => group.getAttribute("label"))).toEqual(["Overnight", "Morning", "Afternoon", "Evening"]);
        expect(screen.getByRole("option", { name: "00:00" })).toBeEnabled();
        fireEvent.change(screen.getByLabelText("Start hour 1"), { target: { value: "0" } });
        expect(screen.getByText("Tomorrow, 12 to 1 a.m.")).toBeInTheDocument();
    });

    it("disables shortcuts after the last future hour and at the edit limit", () => {
        vi.setSystemTime(new Date("2026-01-16T06:15:00Z"));
        render(<WindowsPicker value={[]} onChange={vi.fn()} createdAt="2025-12-16T12:00:00Z" />);
        expect(screen.getByRole("button", { name: "Today" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Tomorrow" })).toBeDisabled();
    });

    it("shows a row error for duplicate date and hour slots", () => {
        render(<Picker value={[{ date: "2026-12-01", startHour: 9 }]} />);
        fireEvent.click(screen.getByRole("button", { name: "Add window" }));
        fireEvent.change(screen.getByLabelText("Date 2"), { target: { value: "2026-12-01" } });
        fireEvent.change(screen.getByLabelText("Start hour 2"), { target: { value: "9" } });
        expect(screen.getAllByRole("alert")).toHaveLength(2);
        expect(screen.getByLabelText("Date 2")).toHaveAccessibleDescription(/already listed/);
        fireEvent.change(screen.getByLabelText("Start hour 2"), { target: { value: "10" } });
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it.each([
        ["2026-02-15T19:00:00Z", "2026-03-17", "2026-03-18", "Sun, Feb 15", "Tue, Mar 17"],
        ["2026-04-15T18:00:00Z", "2026-05-15", "2026-05-16", "Wed, Apr 15", "Fri, May 15"],
    ])("checks the 30-day date limit at %s", (now, lastDate, invalidDate, firstLabel, lastLabel) => {
        vi.setSystemTime(new Date(now));
        render(<Picker />);
        const date = screen.getByLabelText("Date 1");
        expect(date).toHaveAttribute("max", lastDate);
        fireEvent.change(date, { target: { value: invalidDate } });
        expect(screen.getByRole("alert")).toHaveTextContent(`Choose a date from ${firstLabel} to ${lastLabel}.`);
        fireEvent.change(date, { target: { value: lastDate } });
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("emits only the stored date and numeric hour for complete rows", () => {
        const onChange = vi.fn();
        render(<Picker onChange={onChange} />);
        fireEvent.change(screen.getByLabelText("Date 1"), { target: { value: "2026-12-01" } });
        expect(onChange).toHaveBeenLastCalledWith([]);
        fireEvent.change(screen.getByLabelText("Start hour 1"), { target: { value: "9" } });
        expect(onChange).toHaveBeenLastCalledWith([{ date: "2026-12-01", startHour: 9 }]);
    });

    it("uses the original creation timestamp for the edit limit", () => {
        render(<WindowsPicker value={[]} onChange={vi.fn()} createdAt="2026-11-01T05:00:00Z" />);
        expect(screen.getByLabelText("Date 1")).toHaveAttribute("max", "2026-11-30");
    });

    it("updates when the parent replaces the windows", () => {
        const { rerender } = render(<WindowsPicker value={[]} onChange={vi.fn()} />);
        rerender(<WindowsPicker value={[{ date: "2026-12-01", startHour: 0 }]} onChange={vi.fn()} />);
        expect(screen.getByLabelText("Date 1")).toHaveValue("2026-12-01");
        expect(screen.getByLabelText("Start hour 1")).toHaveValue("0");
    });

    it.each(["date", "hour"])("clears a half-filled %s row when the parent resets", (field) => {
        function ResettablePicker() {
            const [windows, setWindows] = useState<PickupWindow[]>([]);
            return <>
                <WindowsPicker value={windows} onChange={setWindows} />
                <button onClick={() => setWindows([])}>Clear</button>
            </>;
        }
        render(<ResettablePicker />);
        const label = field === "date" ? "Date 1" : "Start hour 1";
        const value = field === "date" ? "2026-12-01" : "9";
        fireEvent.change(screen.getByLabelText(label), { target: { value } });
        expect(screen.getByLabelText(label)).toHaveValue(value);
        fireEvent.click(screen.getByRole("button", { name: "Clear" }));
        expect(screen.getByLabelText("Date 1")).toHaveValue("");
        expect(screen.getByLabelText("Start hour 1")).toHaveValue("");
    });

    it("clears partial rows when rerendered with a new empty value", () => {
        const { rerender } = render(<WindowsPicker value={[]} onChange={vi.fn()} />);
        fireEvent.change(screen.getByLabelText("Date 1"), { target: { value: "2026-12-01" } });
        expect(screen.getByLabelText("Date 1")).toHaveValue("2026-12-01");
        rerender(<WindowsPicker value={[]} onChange={vi.fn()} />);
        expect(screen.getByLabelText("Date 1")).toHaveValue("");
    });

    it("keeps a partial row when the parent value has not changed", () => {
        const value: PickupWindow[] = [];
        const { rerender } = render(<WindowsPicker value={value} onChange={vi.fn()} />);
        fireEvent.change(screen.getByLabelText("Date 1"), { target: { value: "2026-12-01" } });
        rerender(<WindowsPicker value={value} onChange={vi.fn()} />);
        expect(screen.getByLabelText("Date 1")).toHaveValue("2026-12-01");
    });

    it("shows errors for past dates and hours in Calgary", () => {
        vi.setSystemTime(new Date("2026-11-15T01:00:00Z"));
        render(<Picker />);
        fireEvent.change(screen.getByLabelText("Date 1"), { target: { value: "2026-11-13" } });
        expect(screen.getByRole("alert")).toHaveTextContent("Choose a date from");
        fireEvent.change(screen.getByLabelText("Date 1"), { target: { value: "2026-11-14" } });
        fireEvent.change(screen.getByLabelText("Start hour 1"), { target: { value: "0" } });
        expect(screen.getByRole("alert")).toHaveTextContent("Choose a pickup time in the future.");
        fireEvent.change(screen.getByLabelText("Start hour 1"), { target: { value: "23" } });
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("has its own card by default and none when embedded", () => {
        const { container, unmount } = render(<Picker />);
        expect(container.querySelector("fieldset")).toHaveClass("rounded-2xl", "border", "p-4", "sm:p-5", "bg-surface-elevated");
        unmount();
        const embedded = render(<WindowsPicker embedded value={[]} onChange={vi.fn()} />);
        const fieldset = embedded.container.querySelector("fieldset")!;
        for (const name of ["rounded-2xl", "border", "p-4", "sm:p-5", "bg-surface-elevated", "shadow-rest"]) expect(fieldset).not.toHaveClass(name);
    });

    it("disables the hours already past today, and none on a later day", () => {
        render(<Picker />);
        fireEvent.change(screen.getByLabelText("Date 1"), { target: { value: "2026-11-14" } });
        expect(screen.getByRole("option", { name: "22:00" })).toBeDisabled();
        expect(screen.getByRole("option", { name: "23:00" })).toBeEnabled();
        fireEvent.change(screen.getByLabelText("Date 1"), { target: { value: "2026-11-15" } });
        expect(screen.getByRole("option", { name: "00:00" })).toBeEnabled();
    });

    it("shows Remove only when there is more than one row", () => {
        render(<Picker />);
        expect(screen.queryByRole("button", { name: /Remove window/ })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Add window" }));
        expect(screen.getAllByRole("button", { name: /Remove window/ })).toHaveLength(2);
    });

    it("reports incomplete rows and marks the missing field when showIncomplete is set", () => {
        const onIncompleteChange = vi.fn();
        render(<WindowsPicker value={[]} onChange={vi.fn()} showIncomplete onIncompleteChange={onIncompleteChange} />);
        // Completely empty row is not incomplete
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        fireEvent.change(screen.getByLabelText("Date 1"), { target: { value: "2026-12-01" } });
        expect(onIncompleteChange).toHaveBeenLastCalledWith(true);
        expect(screen.getByRole("alert")).toHaveTextContent("Choose both a date and an hour, or remove this window.");
        expect(screen.getByLabelText("Date 1")).toHaveAttribute("aria-invalid", "false");
        expect(screen.getByLabelText("Start hour 1")).toHaveAttribute("aria-invalid", "true");
        fireEvent.change(screen.getByLabelText("Start hour 1"), { target: { value: "9" } });
        expect(onIncompleteChange).toHaveBeenLastCalledWith(false);
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
});

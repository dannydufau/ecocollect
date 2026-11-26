"use client";

import { useId, useState } from "react";
import { Button, FieldError, card, input, select } from "@/components/ui";
import { calgaryHour, calgaryToday, formatHour, formatWindow, friendlyWindow } from "@/lib/time";
import type { PickupWindow } from "@/lib/types";

type Row = { date: string; startHour: string };
const hourGroups = ["Overnight", "Morning", "Afternoon", "Evening"];

function rowsFrom(windows: PickupWindow[]): Row[] {
    return windows.length
        ? windows.map(window => ({ date: window.date, startHour: String(window.startHour) }))
        : [{ date: "", startHour: "" }];
}

function dateLabel(date: string): string {
    return formatWindow({ date, startHour: 0 }).split(", ").slice(0, 2).join(", ");
}

export function WindowsPicker({ value, onChange, createdAt, embedded = false, showIncomplete = false, onIncompleteChange }: {
    value: PickupWindow[];
    onChange: (windows: PickupWindow[]) => void;
    createdAt?: string;
    embedded?: boolean;
    showIncomplete?: boolean;
    onIncompleteChange?: (incomplete: boolean) => void;
}) {
    const id = useId();
    const [draft, setDraft] = useState(() => ({ value, emitted: value, rows: rowsFrom(value) }));
    if (draft.value !== value) {
        setDraft({ value, emitted: value, rows: value === draft.emitted ? draft.rows : rowsFrom(value) });
    }

    const today = calgaryToday();
    const nextDay = new Date(`${today}T12:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const tomorrow = calgaryToday(nextDay);
    const lastDay = new Date(createdAt ?? `${today}T12:00:00Z`);
    lastDay.setUTCDate(lastDay.getUTCDate() + 30);
    const maxDate = calgaryToday(lastDay);
    const currentHour = calgaryHour();

    function updateRows(rows: Row[]) {
        const windows = rows
            .filter(row => row.date && row.startHour !== "")
            .map(row => ({ date: row.date, startHour: Number(row.startHour) }));
        const incomplete = rows.some(row => Boolean(row.date) !== (row.startHour !== ""));
        setDraft({ value, emitted: windows, rows });
        onIncompleteChange?.(incomplete);
        onChange(windows);
    }

    function updateRow(index: number, patch: Partial<Row>) {
        updateRows(draft.rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
    }

    return (
        <fieldset className={embedded ? "min-w-0" : `${card} min-w-0`}>
            <legend className={`float-left mb-2 ${embedded ? "font-semibold" : "text-title font-bold"}`}>Pickup windows</legend>
            <div className="clear-both flex flex-col gap-3">
                <p className="text-small text-text-muted">Each window is one hour (Calgary time). Offer up to 3. They must start in the future and within 30 days.</p>
                {draft.rows.map((row, index) => {
                    const partial = Boolean(row.date) !== (row.startHour !== "");
                    let error = "";
                    let incompleteOnly = false;
                    if (row.date && (row.date < today || row.date > maxDate)) {
                        error = `Choose a date from ${dateLabel(today)} to ${dateLabel(maxDate)}.`;
                    } else if (row.date === today && row.startHour !== "" && Number(row.startHour) <= currentHour) {
                        error = "Choose a pickup time in the future.";
                    } else if (row.date && row.startHour !== "" && draft.rows.some((other, otherIndex) =>
                        otherIndex !== index && other.date === row.date && other.startHour === row.startHour)) {
                        error = "Choose a different date or hour. This pickup window is already listed.";
                    } else if (showIncomplete && partial) {
                        error = "Choose both a date and an hour, or remove this window.";
                        incompleteOnly = true;
                    }
                    const errorId = `${id}-${index}-error`;
                    const dateInvalid = Boolean(error) && (!incompleteOnly || !row.date);
                    const hourInvalid = Boolean(error) && (!incompleteOnly || row.startHour === "");

                    return (
                        <div key={index} className="min-w-0">
                            <div className="grid min-w-0 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
                                <div className="min-w-0">
                                    <label htmlFor={`${id}-${index}-date`} className="mb-1 block font-semibold">Date {index + 1}</label>
                                    <input id={`${id}-${index}-date`} type="date" required
                                        value={row.date} min={today} max={maxDate}
                                        onChange={event => updateRow(index, { date: event.target.value })}
                                        aria-invalid={dateInvalid} aria-describedby={error ? errorId : undefined}
                                        className={`${input} min-w-0`} />
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        <Button variant="secondary" size="sm" disabled={today > maxDate || currentHour >= 23}
                                            onClick={() => updateRow(index, { date: today })}>Today</Button>
                                        <Button variant="secondary" size="sm" disabled={tomorrow > maxDate}
                                            onClick={() => updateRow(index, { date: tomorrow })}>Tomorrow</Button>
                                    </div>
                                </div>
                                <div className="min-w-0">
                                    <label htmlFor={`${id}-${index}-hour`} className="mb-1 block font-semibold">Start hour {index + 1}</label>
                                    <select id={`${id}-${index}-hour`} required value={row.startHour}
                                        onChange={event => updateRow(index, { startHour: event.target.value })}
                                        aria-invalid={hourInvalid} aria-describedby={error ? errorId : undefined}
                                        className={`${select} min-w-0`}>
                                        <option value="" disabled>Choose an hour</option>
                                        {hourGroups.map((label, groupIndex) => (
                                            <optgroup key={label} label={label}>
                                                {Array.from({ length: 6 }, (_, offset) => {
                                                    const hour = groupIndex * 6 + offset;
                                                    return <option key={hour} value={hour} disabled={row.date === today && hour <= currentHour}>{formatHour(hour)}</option>;
                                                })}
                                            </optgroup>
                                        ))}
                                    </select>
                                </div>
                                {draft.rows.length > 1 && <Button variant="secondary" aria-label={`Remove window ${index + 1}`}
                                    onClick={() => updateRows(draft.rows.filter((_, rowIndex) => rowIndex !== index))}>
                                    Remove
                                </Button>}
                            </div>
                            {error && <FieldError id={errorId} className="mt-2">{error}</FieldError>}
                            {row.date && row.startHour !== "" && <p className="mt-2 text-small text-text-muted">
                                {friendlyWindow({ date: row.date, startHour: Number(row.startHour) })}
                            </p>}
                        </div>
                    );
                })}
                <div>
                    <Button variant="secondary" disabled={draft.rows.length >= 3}
                        onClick={() => updateRows([...draft.rows, { date: "", startHour: "" }])}>
                        Add window
                    </Button>
                </div>
            </div>
        </fieldset>
    );
}

"use client";

import { useId, useState } from "react";
import { calgaryToday, formatHour, formatWindow } from "@/lib/time";
import type { PickupWindow } from "@/lib/types";

type Row = { date: string; startHour: string };

function rowsFrom(windows: PickupWindow[]): Row[] {
    return windows.length
        ? windows.map(window => ({ date: window.date, startHour: String(window.startHour) }))
        : [{ date: "", startHour: "" }];
}

function dateLabel(date: string): string {
    return formatWindow({ date, startHour: 0 }).split(", ").slice(0, 2).join(", ");
}

export function WindowsPicker({ value, onChange, createdAt }: {
    value: PickupWindow[];
    onChange: (windows: PickupWindow[]) => void;
    createdAt?: string;
}) {
    const id = useId();
    const [draft, setDraft] = useState(() => ({ value, emitted: value, rows: rowsFrom(value) }));
    if (draft.value !== value) {
        setDraft({ value, emitted: value, rows: value === draft.emitted ? draft.rows : rowsFrom(value) });
    }

    const today = calgaryToday();
    const lastDay = new Date(createdAt ?? `${today}T12:00:00Z`);
    lastDay.setUTCDate(lastDay.getUTCDate() + 30);
    const maxDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Edmonton" }).format(lastDay);
    const currentHour = Number(new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Edmonton", hour: "2-digit", hourCycle: "h23",
    }).format(new Date()));

    function updateRows(rows: Row[]) {
        const windows = rows
            .filter(row => row.date && row.startHour !== "")
            .map(row => ({ date: row.date, startHour: Number(row.startHour) }));
        setDraft({ value, emitted: windows, rows });
        onChange(windows);
    }

    function updateRow(index: number, patch: Partial<Row>) {
        updateRows(draft.rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
    }

    return (
        <fieldset className="min-w-0 space-y-3">
            <legend className="mb-2 font-medium">Pickup windows (Calgary time)</legend>
            {draft.rows.map((row, index) => {
                let error = "";
                if (row.date && (row.date < today || row.date > maxDate)) {
                    error = `Choose a date from ${dateLabel(today)} to ${dateLabel(maxDate)}.`;
                } else if (row.date === today && row.startHour !== "" && Number(row.startHour) <= currentHour) {
                    error = "Choose a pickup time in the future.";
                } else if (row.date && row.startHour !== "" && draft.rows.some((other, otherIndex) =>
                    otherIndex !== index && other.date === row.date && other.startHour === row.startHour)) {
                    error = "Choose a different date or hour. This pickup window is already listed.";
                }
                const errorId = `${id}-${index}-error`;

                return (
                    <div key={index} className="min-w-0 rounded-lg border border-stone-300 p-3">
                        <div className="grid min-w-0 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                            <div className="min-w-0">
                                <label htmlFor={`${id}-${index}-date`} className="mb-1 block text-sm">Date {index + 1}</label>
                                <input id={`${id}-${index}-date`} type="date" required
                                    value={row.date} min={today} max={maxDate}
                                    onChange={event => updateRow(index, { date: event.target.value })}
                                    aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}
                                    className="min-h-11 w-full min-w-0 rounded-lg border border-stone-400 bg-white px-3 text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2" />
                            </div>
                            <div className="min-w-0">
                                <label htmlFor={`${id}-${index}-hour`} className="mb-1 block text-sm">Start hour {index + 1}</label>
                                <select id={`${id}-${index}-hour`} required value={row.startHour}
                                    onChange={event => updateRow(index, { startHour: event.target.value })}
                                    aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}
                                    className="min-h-11 w-full min-w-0 rounded-lg border border-stone-400 bg-white px-3 text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2">
                                    <option value="" disabled>Choose an hour</option>
                                    {Array.from({ length: 24 }, (_, hour) => (
                                        <option key={hour} value={hour}>{formatHour(hour)}</option>
                                    ))}
                                </select>
                            </div>
                            <button type="button" aria-label={`Remove window ${index + 1}`}
                                disabled={draft.rows.length === 1}
                                onClick={() => updateRows(draft.rows.filter((_, rowIndex) => rowIndex !== index))}
                                className="min-h-11 rounded-lg border border-stone-400 px-3 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">
                                Remove
                            </button>
                        </div>
                        {error && <p id={errorId} role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
                    </div>
                );
            })}
            <button type="button" disabled={draft.rows.length >= 3}
                onClick={() => updateRows([...draft.rows, { date: "", startHour: "" }])}
                className="min-h-11 rounded-lg border border-stone-400 px-3 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">
                Add window
            </button>
        </fieldset>
    );
}

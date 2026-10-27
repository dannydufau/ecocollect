"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { CATEGORIES, OTHER_CATEGORY_ID } from "@/lib/categories";
import { queryKeys } from "@/lib/query-keys";
import { calgaryInstant, calgaryToday, formatHour } from "@/lib/time";
import type { CreateRequestsBody, CreatedRequest } from "@/lib/types";

type ItemRow = { categoryId: string; quantity: string; description: string };
type WindowRow = { date: string; startHour: string };

const EMPTY_ITEM: ItemRow = { categoryId: "", quantity: "1", description: "" };
const EMPTY_WINDOW: WindowRow = { date: "", startHour: "" };
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MAX_WINDOWS = 3;
const EXPIRY_DAYS = 30;

// Checks the same rules as the backend (contract 3.4), so most mistakes never leave the browser.
function validate(items: ItemRow[], windows: WindowRow[], safety: boolean): string | null {
    for (const item of items) {
        if (!item.categoryId) return "Choose a category for every item.";
        const quantity = Number(item.quantity);
        if (!Number.isInteger(quantity) || quantity < 1) return "Quantity must be a whole number of at least 1.";
        if (item.categoryId === OTHER_CATEGORY_ID && !item.description.trim()) return "Describe the item for Other Electronics.";
    }
    const now = new Date();
    const latest = new Date(now.getTime() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const dates = new Set<string>();
    for (const window of windows) {
        if (!window.date || window.startHour === "") return "Pick a date and a start time for every window.";
        if (dates.has(window.date)) return "Each pickup window must be on a different date.";
        dates.add(window.date);
        const start = calgaryInstant(window.date, Number(window.startHour));
        if (start <= now) return "Pickup windows must be in the future.";
        if (start >= latest) return `Pickup windows must be within the next ${EXPIRY_DAYS} days.`;
    }
    if (!safety) return "Please confirm the safety acknowledgement.";
    return null;
}

function errorMessage(err: unknown): string {
    if (err instanceof ApiError) {
        if (err.status === 400) {
            const body = err.body as { error?: string } | undefined;
            return body?.error ? `Please fix: ${body.error}` : "Some fields are invalid.";
        }
        if (err.status === 401) return "Your session expired. Please log in again.";
        if (err.status === 403) return "Only residents can create pickup requests.";
    }
    return "Could not create the request. Please try again.";
}

export default function CreateRequestForm() {
    const queryClient = useQueryClient();
    const [items, setItems] = useState<ItemRow[]>([EMPTY_ITEM]);
    const [windows, setWindows] = useState<WindowRow[]>([EMPTY_WINDOW]);
    const [notes, setNotes] = useState("");
    const [safety, setSafety] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const mutation = useMutation({
        mutationFn: (body: CreateRequestsBody) => api.post<{ requests: CreatedRequest[] }>("/api/requests", body),
        onSuccess: (data) => {
            const count = data.requests.length;
            setSuccess(`Pickup request submitted (${count} ${count === 1 ? "item" : "items"}).`);
            setItems([EMPTY_ITEM]);
            setWindows([EMPTY_WINDOW]);
            setNotes("");
            setSafety(false);
            queryClient.invalidateQueries({ queryKey: queryKeys.myRequests }); // contract 9.2
        },
        onError: (err) => setFormError(errorMessage(err)),
    });

    function updateItem(index: number, change: Partial<ItemRow>) {
        setItems(items.map((item, i) => (i === index ? { ...item, ...change } : item)));
    }

    function updateWindow(index: number, change: Partial<WindowRow>) {
        setWindows(windows.map((window, i) => (i === index ? { ...window, ...change } : window)));
    }

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSuccess(null);
        const problem = validate(items, windows, safety);
        setFormError(problem);
        if (problem || mutation.isPending) return;

        mutation.mutate({
            items: items.map((item) => ({
                categoryId: item.categoryId,
                quantity: Number(item.quantity),
                ...(item.description.trim() ? { description: item.description.trim() } : {}),
            })),
            windows: windows.map((window) => ({ date: window.date, startHour: Number(window.startHour) })),
            ...(notes.trim() ? { notes: notes.trim() } : {}),
            safetyAcknowledged: true,
        });
    }

    return (
        <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-6 rounded border p-6">
            <h2 className="text-xl font-semibold">New pickup request</h2>

            <fieldset className="flex flex-col gap-3">
                <legend className="mb-2 font-medium">Items</legend>
                {items.map((item, index) => (
                    <div key={index} className="flex flex-wrap items-end gap-2">
                        <label className="flex flex-col gap-1">
                            Category
                            <select
                                value={item.categoryId}
                                onChange={(e) => updateItem(index, { categoryId: e.target.value })}
                                className="rounded border px-2 py-2"
                            >
                                <option value="">Choose...</option>
                                {CATEGORIES.map((category) => (
                                    <option key={category.id} value={category.id}>
                                        {category.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="flex w-24 flex-col gap-1">
                            Quantity
                            <input
                                type="number"
                                min={1}
                                step={1}
                                value={item.quantity}
                                onChange={(e) => updateItem(index, { quantity: e.target.value })}
                                className="rounded border px-2 py-2"
                            />
                        </label>
                        {item.categoryId === OTHER_CATEGORY_ID && (
                            <label className="flex flex-1 flex-col gap-1">
                                Description
                                <input
                                    value={item.description}
                                    onChange={(e) => updateItem(index, { description: e.target.value })}
                                    className="rounded border px-2 py-2"
                                />
                            </label>
                        )}
                        {items.length > 1 && (
                            <button
                                type="button"
                                onClick={() => setItems(items.filter((_, i) => i !== index))}
                                className="rounded border px-3 py-2 text-sm"
                            >
                                Remove
                            </button>
                        )}
                    </div>
                ))}
                <button
                    type="button"
                    onClick={() => setItems([...items, EMPTY_ITEM])}
                    className="self-start rounded border px-3 py-1 text-sm"
                >
                    Add item
                </button>
            </fieldset>

            <fieldset className="flex flex-col gap-3">
                <legend className="mb-2 font-medium">Pickup windows (Calgary time, 1 to 3, different dates)</legend>
                {windows.map((window, index) => (
                    <div key={index} className="flex flex-wrap items-end gap-2">
                        <label className="flex flex-col gap-1">
                            Date
                            <input
                                type="date"
                                min={calgaryToday()}
                                value={window.date}
                                onChange={(e) => updateWindow(index, { date: e.target.value })}
                                className="rounded border px-2 py-2"
                            />
                        </label>
                        <label className="flex flex-col gap-1">
                            Start time
                            <select
                                value={window.startHour}
                                onChange={(e) => updateWindow(index, { startHour: e.target.value })}
                                className="rounded border px-2 py-2"
                            >
                                <option value="">Choose...</option>
                                {HOURS.map((hour) => (
                                    <option key={hour} value={hour}>
                                        {formatHour(hour)} to {formatHour((hour + 1) % 24)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {windows.length > 1 && (
                            <button
                                type="button"
                                onClick={() => setWindows(windows.filter((_, i) => i !== index))}
                                className="rounded border px-3 py-2 text-sm"
                            >
                                Remove
                            </button>
                        )}
                    </div>
                ))}
                {windows.length < MAX_WINDOWS && (
                    <button
                        type="button"
                        onClick={() => setWindows([...windows, EMPTY_WINDOW])}
                        className="self-start rounded border px-3 py-1 text-sm"
                    >
                        Add window
                    </button>
                )}
            </fieldset>

            <label className="flex flex-col gap-1">
                Notes (optional)
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="rounded border px-2 py-2" />
            </label>

            <label className="flex items-start gap-2">
                <input type="checkbox" checked={safety} onChange={(e) => setSafety(e.target.checked)} className="mt-1" />
                I confirm the items are safe to handle (no leaking batteries or broken screens).
            </label>

            {formError && (
                <p role="alert" className="text-sm text-red-600">
                    {formError}
                </p>
            )}
            {success && <p className="text-sm text-green-700">{success}</p>}

            <button
                type="submit"
                disabled={mutation.isPending}
                className="self-start rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50"
            >
                {mutation.isPending ? "Submitting..." : "Submit request"}
            </button>
        </form>
    );
}
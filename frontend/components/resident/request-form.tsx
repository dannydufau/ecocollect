"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CategoryPicker, useCategories } from "./category-picker";
import { WindowsPicker } from "./windows-picker";
import { calgaryInstant } from "@/lib/time";
import type { PickupWindow } from "@/lib/types";

export type RequestValues = {
    items: { categoryId: string; quantity: string }[];
    windows: PickupWindow[];
    notes: string;
};

export function validate(values: RequestValues, createdAt = new Date().toISOString()): Record<string, string> {
    const errors: Record<string, string> = {};
    const selected = new Set<string>();
    if (!values.items.length) errors.items = "Add at least one item.";
    values.items.forEach((item, index) => {
        if (!item.categoryId) errors[`items[${index}].categoryId`] = "Choose a category.";
        else if (selected.has(item.categoryId)) errors[`items[${index}].categoryId`] = "This category is already selected.";
        selected.add(item.categoryId);
        const quantity = Number(item.quantity);
        if (!item.quantity.trim() || !Number.isSafeInteger(quantity) || quantity < 1) {
            errors[`items[${index}].quantity`] = "Enter a whole number, 1 or more.";
        }
    });
    if (values.windows.length < 1 || values.windows.length > 3) errors.windows = "Choose one to three pickup windows.";
    const slots = new Set<string>();
    values.windows.forEach(window => {
        const date = new Date(`${window.date}T00:00:00Z`);
        const validDate = /^\d{4}-\d{2}-\d{2}$/.test(window.date) && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === window.date;
        if (!validDate || !Number.isInteger(window.startHour) || window.startHour < 0 || window.startHour > 23) {
            errors.windows = "Choose a valid date and hour for every pickup window.";
            return;
        }
        const start = calgaryInstant(window.date, window.startHour).getTime();
        const slot = `${window.date}:${window.startHour}`;
        if (slots.has(slot)) errors.windows = "Choose a different date or hour for each pickup window.";
        else if (start <= Date.now()) errors.windows = "Choose pickup windows in the future.";
        else if (start + 3600000 > Date.parse(createdAt) + 30 * 86400000) errors.windows = "Pickup windows must end within 30 days of request creation.";
        slots.add(slot);
    });
    return errors;
}

export default function RequestForm({ initialValues, createdAt, onValid, fieldErrors = {}, busy = false, submitDisabled = false, submitHint, submitLabel = "Review request", onEdit, children }: {
    initialValues?: RequestValues;
    createdAt?: string;
    onValid?: (values: RequestValues) => void;
    fieldErrors?: Record<string, string>;
    busy?: boolean;
    submitDisabled?: boolean;
    submitHint?: string;
    submitLabel?: string;
    onEdit?: () => void;
    children?: ReactNode;
}) {
    const id = useId();
    const { data: categories = [] } = useCategories();
    const [values, setValues] = useState<RequestValues>(() => initialValues ?? {
        items: [{ categoryId: "", quantity: "1" }], windows: [], notes: "",
    });
    const [tried, setTried] = useState(false);
    const [failedSubmits, setFailedSubmits] = useState(0);
    const formRef = useRef<HTMLFormElement>(null);
    // Errors only show after the first submit, then follow the values as the user types
    const errors = { ...(tried ? validate(values, createdAt) : {}), ...fieldErrors };
    const windowErrors = [...new Set(Object.entries(errors).filter(([key]) => key === "windows" || key.startsWith("windows[") || key.startsWith("windows.")).map(([, message]) => message))];

    // Move focus to the first problem once the errors are on screen
    useEffect(() => {
        if (failedSubmits) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]')?.focus();
    }, [failedSubmits]);

    function updateValues(next: RequestValues) {
        setValues(next);
        onEdit?.();
    }

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy || submitDisabled) return;
        setTried(true);
        if (Object.keys(validate(values, createdAt)).length) setFailedSubmits(count => count + 1);
        else onValid?.(values);
    }

    return (
        <form ref={formRef} onSubmit={submit} aria-busy={busy} noValidate className="min-w-0 max-w-2xl space-y-6 rounded-xl border border-stone-200 bg-white p-4 text-stone-900 sm:p-6">
            <fieldset disabled={busy} className="min-w-0 space-y-6">
                <fieldset className="min-w-0 space-y-4">
                    <legend className="mb-2 text-xl font-semibold">Items</legend>
                    {errors.items && <p role="alert" tabIndex={-1} className="text-sm text-red-700">{errors.items}</p>}
                    {values.items.map((item, index) => {
                        const categoryError = errors[`items[${index}].categoryId`];
                        const quantityError = errors[`items[${index}].quantity`];
                        const category = categories.find(category => category.categoryId === item.categoryId);
                        const weight = category && Number(item.quantity) > 0 && Number.isSafeInteger(Number(item.quantity))
                            ? (category.standardWeightKg * Number(item.quantity)).toFixed(2) : null;
                        const update = (patch: Partial<typeof item>) => updateValues({ ...values, items: values.items.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row) });
                        return <fieldset key={index} className="min-w-0 space-y-3 rounded-lg border border-stone-300 p-3">
                            <legend className="px-1 font-medium">Item {index + 1}</legend>
                            <div className="grid min-w-0 gap-3 sm:grid-cols-[2fr_1fr] sm:items-start">
                                <div className="min-w-0">
                                    <CategoryPicker value={item.categoryId} onChange={categoryId => update({ categoryId })} invalid={Boolean(categoryError)}
                                        disabledIds={values.items.filter((_, rowIndex) => rowIndex !== index).map(row => row.categoryId)} />
                                    {categoryError && <p role="alert" className="mt-1 text-sm text-red-700">{categoryError}</p>}
                                </div>
                                <div>
                                    <label htmlFor={`${id}-quantity-${index}`} className="mb-1 block text-sm font-medium">Quantity</label>
                                    <input id={`${id}-quantity-${index}`} type="number" min="1" step="1" value={item.quantity}
                                        onChange={event => update({ quantity: event.target.value })}
                                        aria-invalid={Boolean(quantityError)} aria-describedby={quantityError ? `${id}-quantity-error-${index}` : undefined}
                                        className="min-h-11 w-full min-w-0 rounded-lg border border-stone-400 px-3 focus-visible:outline-2 focus-visible:outline-offset-2" />
                                    {quantityError && <p id={`${id}-quantity-error-${index}`} role="alert" className="mt-1 text-sm text-red-700">{quantityError}</p>}
                                </div>
                            </div>
                            <p className="text-sm text-stone-700">Estimated weight: {weight === null ? "—" : `${weight} kg`}</p>
                            {values.items.length > 1 && <button type="button" aria-label={`Remove item ${index + 1}`}
                                onClick={() => updateValues({ ...values, items: values.items.filter((_, rowIndex) => rowIndex !== index) })}
                                className="min-h-11 rounded-lg border border-stone-400 px-3 focus-visible:outline-2 focus-visible:outline-offset-2">Remove item</button>}
                        </fieldset>;
                    })}
                    <button type="button" disabled={!categories.length || values.items.length >= categories.length}
                        onClick={() => updateValues({ ...values, items: [...values.items, { categoryId: "", quantity: "1" }] })}
                        className="min-h-11 rounded-lg border border-stone-400 px-3 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">Add another item</button>
                </fieldset>
                <WindowsPicker value={values.windows} onChange={windows => updateValues({ ...values, windows })} createdAt={createdAt} />
                {windowErrors.length > 0 && <p role="alert" tabIndex={-1} className="text-sm text-red-700">{windowErrors.join(" ")}</p>}
                <div>
                    <label htmlFor={`${id}-notes`} className="mb-1 block font-medium">Notes (optional)</label>
                    <textarea id={`${id}-notes`} value={values.notes} onChange={event => updateValues({ ...values, notes: event.target.value })}
                        aria-invalid={Boolean(errors.notes)} aria-describedby={errors.notes ? `${id}-notes-error` : undefined}
                        rows={3} className="w-full min-w-0 rounded-lg border border-stone-400 p-3 focus-visible:outline-2 focus-visible:outline-offset-2" />
                    {errors.notes && <p id={`${id}-notes-error`} role="alert" className="text-sm text-red-700">{errors.notes}</p>}
                </div>
                <p>We collect from the address in your profile. <Link href="/profile" className="text-[#8c491a] underline underline-offset-2">Change address</Link></p>
                {children}
                <div className="flex flex-wrap items-center gap-3">
                    <button type="submit" disabled={busy || submitDisabled} aria-describedby={submitHint ? `${id}-hint` : undefined} className="min-h-11 rounded-lg bg-[#9e5220] px-4 text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">{busy ? "Sending..." : submitLabel}</button>
                    {submitHint && <p id={`${id}-hint`} className="text-[13px] text-stone-700">{submitHint}</p>}
                </div>
            </fieldset>
        </form>
    );
}

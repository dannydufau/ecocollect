"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import PhotoPicker from "@/components/photo-picker";
import { Button, RequestPhoto, card, input, textarea } from "@/components/ui";
import { CategoryPicker, useCategories } from "./category-picker";
import { WindowsPicker } from "./windows-picker";
import { calgaryInstant, isValidWindow } from "@/lib/time";
import type { PickupWindow } from "@/lib/types";

export type RequestValues = {
    // photo null removes the saved photo when editing
    items: { categoryId: string; quantity: string; photo?: { fileId: string } | null }[];
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
        if (!isValidWindow(window)) {
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

export default function RequestForm({ initialValues, createdAt, single = false, currentPhoto, cancelHref, onValid, fieldErrors = {}, busy = false, submitDisabled = false, submitHint, submitLabel = "Review request", onEdit, children }: {
    initialValues?: RequestValues;
    createdAt?: string;
    single?: boolean;
    currentPhoto?: { url: string; refetch: () => void };
    cancelHref?: string;
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
    // Rows are removed from the middle, so each one keeps its own key and its photo stays with it
    const [keys, setKeys] = useState(() => values.items.map((_, index) => index));
    // Replacing keeps the saved photo until a new one is uploaded
    const [replacing, setReplacing] = useState(false);
    const [tried, setTried] = useState(false);
    const [failedSubmits, setFailedSubmits] = useState(0);
    const formRef = useRef<HTMLFormElement>(null);
    // Errors only show after the first submit, then follow the values as the user types
    const errors = { ...(tried ? validate(values, createdAt) : {}), ...fieldErrors };
    const windowErrors = [...new Set(Object.entries(errors).filter(([key]) => key === "windows" || key.startsWith("windows[") || key.startsWith("windows.")).map(([, message]) => message))];

    // Move focus to the first problem once the errors are on screen, for our own checks and for the server's
    const serverErrorKeys = Object.keys(fieldErrors).join();
    useEffect(() => {
        if (failedSubmits || serverErrorKeys) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]')?.focus();
    }, [failedSubmits, serverErrorKeys]);

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
        <form ref={formRef} onSubmit={submit} aria-busy={busy} noValidate className="min-w-0 max-w-2xl space-y-6">
            <fieldset disabled={busy} className="min-w-0 space-y-6">
                <fieldset className="min-w-0 space-y-4">
                    <legend className="sr-only">Items</legend>
                    {errors.items && <p role="alert" tabIndex={-1} className="text-[13px] font-semibold text-danger">{errors.items}</p>}
                    {values.items.map((item, index) => {
                        const categoryError = errors[`items[${index}].categoryId`];
                        const quantityError = errors[`items[${index}].quantity`];
                        // The Request Service names the field items[i].photo.fileId when it is the file that failed
                        const photoError = errors[`items[${index}].photo`] ?? errors[`items[${index}].photo.fileId`];
                        const category = categories.find(category => category.categoryId === item.categoryId);
                        const weight = category && Number(item.quantity) > 0 && Number.isSafeInteger(Number(item.quantity))
                            ? (category.standardWeightKg * Number(item.quantity)).toFixed(2) : null;
                        const update = (patch: Partial<typeof item>) => updateValues({ ...values, items: values.items.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row) });
                        return <fieldset key={keys[index]} className={`${card} min-w-0 space-y-3`}>
                            <legend className="float-left mb-3 font-[family-name:var(--font-heading)] text-[22px]">Item {index + 1}</legend>
                            <div className="clear-both space-y-3">
                                <div className="grid min-w-0 gap-3 sm:grid-cols-[2fr_1fr] sm:items-start">
                                    <div className="min-w-0">
                                        <CategoryPicker value={item.categoryId} onChange={categoryId => update({ categoryId })} invalid={Boolean(categoryError)}
                                            disabledIds={values.items.filter((_, rowIndex) => rowIndex !== index).map(row => row.categoryId)} />
                                        {categoryError && <p role="alert" className="mt-1 text-[13px] font-semibold text-danger">{categoryError}</p>}
                                    </div>
                                    <div>
                                        <label htmlFor={`${id}-quantity-${index}`} className="mb-1 block font-semibold">Quantity</label>
                                        <input id={`${id}-quantity-${index}`} type="number" min="1" step="1" value={item.quantity}
                                            onChange={event => update({ quantity: event.target.value })}
                                            aria-invalid={Boolean(quantityError)} aria-describedby={quantityError ? `${id}-quantity-error-${index}` : undefined}
                                            className={`${input} min-w-0`} />
                                        {quantityError && <p id={`${id}-quantity-error-${index}`} role="alert" className="mt-1 text-[13px] font-semibold text-danger">{quantityError}</p>}
                                    </div>
                                </div>
                                <p>Estimated weight: <strong>{weight === null ? "—" : `${weight} kg`}</strong></p>
                                {currentPhoto && item.photo === undefined && !replacing ? <div className="space-y-2">
                                    <div className="max-w-xs"><RequestPhoto src={currentPhoto.url} alt="Photo of the items" refetch={currentPhoto.refetch} /></div>
                                    <div className="flex flex-wrap gap-3">
                                        <Button variant="secondary" onClick={() => setReplacing(true)}>Replace photo</Button>
                                        <Button variant="secondary" onClick={() => update({ photo: null })}>Remove photo</Button>
                                    </div>
                                </div> : <PhotoPicker purpose="item_photo" optional onUploaded={fileId => update({ photo: { fileId } })}
                                    onClear={() => { update({ photo: replacing ? undefined : currentPhoto ? null : undefined }); setReplacing(false); }} />}
                                {photoError && <p role="alert" className="text-[13px] font-semibold text-danger">{photoError}</p>}
                                {!single && values.items.length > 1 && <div><Button variant="secondary" aria-label={`Remove item ${index + 1}`}
                                    onClick={() => {
                                        setKeys(keys.filter((_, rowIndex) => rowIndex !== index));
                                        updateValues({ ...values, items: values.items.filter((_, rowIndex) => rowIndex !== index) });
                                    }}>Remove item</Button></div>}
                            </div>
                        </fieldset>;
                    })}
                    {!single && <div><Button variant="secondary" disabled={!categories.length || values.items.length >= categories.length}
                        onClick={() => {
                            setKeys([...keys, Math.max(-1, ...keys) + 1]);
                            updateValues({ ...values, items: [...values.items, { categoryId: "", quantity: "1" }] });
                        }}>Add another item</Button></div>}
                </fieldset>
                <WindowsPicker value={values.windows} onChange={windows => updateValues({ ...values, windows })} createdAt={createdAt} />
                {windowErrors.length > 0 && <p role="alert" tabIndex={-1} className="text-[13px] font-semibold text-danger">{windowErrors.join(" ")}</p>}
                <div>
                    <label htmlFor={`${id}-notes`} className="mb-1 block font-semibold">Notes <span className="font-normal text-neutral-700">(optional)</span></label>
                    <textarea id={`${id}-notes`} value={values.notes} onChange={event => updateValues({ ...values, notes: event.target.value })}
                        aria-invalid={Boolean(errors.notes)} aria-describedby={errors.notes ? `${id}-notes-error` : undefined}
                        rows={3} placeholder="For example: Side door" className={`${textarea} min-w-0`} />
                    {errors.notes && <p id={`${id}-notes-error`} role="alert" className="text-[13px] font-semibold text-danger">{errors.notes}</p>}
                </div>
                {single ? <p>The pickup address comes from your profile and can&apos;t be changed here.</p>
                    : <p>We collect from the address in your profile. <Link href="/profile" className="text-accent-700 underline underline-offset-4">Change address</Link></p>}
                {children}
                <div className="flex flex-wrap items-center gap-3">
                    <Button type="submit" busy={busy} busyLabel="Sending..." disabled={submitDisabled} aria-describedby={submitHint ? `${id}-hint` : undefined} className="px-7">{submitLabel}</Button>
                    {cancelHref && <Link href={cancelHref} className="inline-flex min-h-11 items-center rounded-full border border-neutral-600 px-5 py-2 font-[family-name:var(--font-heading)] text-text hover:bg-text/10">Cancel</Link>}
                    {submitHint && <p id={`${id}-hint`} className="text-[13px] text-neutral-700">{submitHint}</p>}
                </div>
            </fieldset>
        </form>
    );
}

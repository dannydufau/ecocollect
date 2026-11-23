"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { Alert, Button, WindowList, card, pageTitle, textLink } from "@/components/ui";
import { formatPostalCode } from "@/lib/postal-code";
import { useProfile } from "@/lib/use-profile";
import { useCategories } from "./category-picker";
import type { RequestValues } from "./request-form";

export default function ReviewRequest({ values, busy, accepted, onBack, onConfirm, children }: {
    values: RequestValues;
    busy: boolean;
    accepted: boolean;
    onBack: () => void;
    onConfirm: () => void;
    children: ReactNode;
}) {
    const profile = useProfile();
    const categories = useCategories();
    const heading = useRef<HTMLHeadingElement>(null);
    useEffect(() => { heading.current?.focus(); }, []);
    const address = profile.data?.address;
    const category = (id: string) => categories.data?.find(item => item.categoryId === id);
    const total = values.items.reduce((sum, item) => sum + (category(item.categoryId)?.standardWeightKg ?? 0) * Number(item.quantity), 0);
    const ready = !profile.isPending && !profile.isError && Boolean(address) && !categories.isPending && !categories.isError;

    return <form onSubmit={event => { event.preventDefault(); if (!busy && accepted && ready) onConfirm(); }}
        aria-busy={busy} className="min-w-0 max-w-xl space-y-6">
        <h1 ref={heading} tabIndex={-1} className={pageTitle}>Review your request</h1>
        <section aria-label="Items" className="space-y-3">
            {categories.isPending && <p role="status">Loading categories...</p>}
            {categories.isError && <Alert variant="error">Could not load categories. <button type="button" onClick={() => void categories.refetch()} className="underline">Try again</button></Alert>}
            <ul className="space-y-3">{values.items.map(item => {
                const found = category(item.categoryId);
                return <li key={item.categoryId} className={`${card} flex flex-col gap-0.5 break-words`}>
                    <span className="text-lg font-bold">{item.quantity} × {found?.name ?? item.categoryId}</span>
                    {found && <span>Estimated weight: <strong>{(found.standardWeightKg * Number(item.quantity)).toFixed(2)} kg</strong></span>}
                    {item.photo && item.photoPreviewUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- this preview is a local object URL
                        <img src={item.photoPreviewUrl} alt="Photo of item" className="mt-2 size-16 rounded-lg border border-border object-cover" />
                    )}
                </li>;
            })}</ul>
            {values.items.length > 1 && <>
                {categories.data && <p>Total estimated weight: <strong className="tabular-nums">{total.toFixed(2)} kg</strong></p>}
                <p className="text-text-muted">This creates {values.items.length} separate requests, one per item.</p>
            </>}
        </section>
        <section aria-label="Pickup windows"><h2 className="mb-2 text-xl">Pickup windows</h2><WindowList windows={values.windows} /><p className="mt-2 text-[13px] text-text-muted">Times are Calgary time.</p></section>
        <section aria-label="Notes"><h2 className="text-xl">Notes</h2><p className="whitespace-pre-wrap break-words">{values.notes || "No notes added."}</p></section>
        <section aria-label="Pickup address" className="space-y-2">
            <h2 className="text-xl">Pickup address</h2>
            {profile.isPending ? <p role="status">Loading your address...</p> : profile.isError ?
                <Alert variant="error">Could not load your address. <button type="button" onClick={() => void profile.refetch()} className="underline">Try again</button></Alert> :
                address ? <p className="break-words">{address.street}, {formatPostalCode(address.postalCode)}</p> : <Alert variant="error">Add an address to your profile before sending.</Alert>}
            <Link href="/profile" target="_blank" rel="noopener noreferrer" className={textLink}>Change address<span className="sr-only"> (opens in a new tab)</span></Link>
        </section>
        <fieldset disabled={busy} className="min-w-0 space-y-4">
            {children}
            <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={onBack}>Back to edit</Button>
                <Button type="submit" busy={busy} busyLabel="Sending..." disabled={!accepted || !ready} aria-describedby={!accepted ? "review-terms-hint" : undefined}>Confirm and send</Button>
            </div>
            {!accepted && <p id="review-terms-hint" className="text-[13px] text-text-muted">Accept the terms above to send.</p>}
        </fieldset>
    </form>;
}

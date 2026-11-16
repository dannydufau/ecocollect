"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { WindowList } from "@/components/ui/window-list";
import { Alert } from "@/components/ui/alert";
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
    const ready = !profile.isPending && !profile.isError && Boolean(address) && !categories.isPending && !categories.isError;

    return <form onSubmit={event => { event.preventDefault(); if (!busy && accepted && ready) onConfirm(); }}
        aria-busy={busy} className="min-w-0 max-w-2xl space-y-6 rounded-xl border border-stone-200 bg-white p-4 text-stone-900 sm:p-6">
        <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold">Review your request</h2>
        <section aria-label="Items" className="space-y-3">
            <h3 className="font-semibold">Items</h3>
            {categories.isPending && <p role="status">Loading categories...</p>}
            {categories.isError && <Alert variant="error">Could not load categories. <button type="button" onClick={() => void categories.refetch()} className="underline">Try again</button></Alert>}
            <ul className="space-y-2">{values.items.map(item => <li key={item.categoryId} className="break-words">
                {categories.data?.find(category => category.categoryId === item.categoryId)?.name ?? item.categoryId}: {item.quantity}
            </li>)}</ul>
        </section>
        <section aria-label="Pickup windows"><h3 className="mb-2 font-semibold">Pickup windows (Calgary time)</h3><WindowList windows={values.windows} /></section>
        <section aria-label="Notes"><h3 className="font-semibold">Notes</h3><p className="whitespace-pre-wrap break-words">{values.notes || "No notes added."}</p></section>
        <section aria-label="Pickup address" className="space-y-2">
            <h3 className="font-semibold">Pickup address</h3>
            {profile.isPending ? <p role="status">Loading your address...</p> : profile.isError ?
                <Alert variant="error">Could not load your address. <button type="button" onClick={() => void profile.refetch()} className="underline">Try again</button></Alert> :
                address ? <p className="break-words">{address.street}, {address.postalCode}</p> : <Alert variant="error">Add an address to your profile before sending.</Alert>}
            <Link href="/profile" className="text-[#8c491a] underline underline-offset-2">Change address</Link>
        </section>
        <fieldset disabled={busy} className="min-w-0 space-y-4">
            {children}
            <div className="flex flex-wrap gap-3">
                <button type="button" onClick={onBack} className="min-h-11 rounded-lg border border-stone-400 px-4 focus-visible:outline-2 focus-visible:outline-offset-2">Back to edit</button>
                <button type="submit" disabled={busy || !accepted || !ready} aria-describedby={!accepted ? "review-terms-hint" : undefined}
                    className="min-h-11 rounded-lg bg-[#9e5220] px-4 text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">{busy ? "Sending..." : "Confirm and send"}</button>
            </div>
            {!accepted && <p id="review-terms-hint" className="text-sm text-stone-700">Accept the terms above to send.</p>}
        </fieldset>
    </form>;
}

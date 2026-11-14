"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Props = {
    open: boolean;
    title: string;
    children: ReactNode;
    confirmLabel: string;
    confirmDisabled?: boolean;
    busy?: boolean;
    error?: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
};

export function ConfirmDialog({ open, title, children, confirmLabel, confirmDisabled = false,
    busy = false, error, danger = false, onConfirm, onCancel }: Props) {
    const ref = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) dialog.close();
    }, [open]);

    return (
        <dialog ref={ref} onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}
            className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-stone-200 bg-white p-6 text-stone-900 shadow-xl backdrop:bg-black/50"
            aria-labelledby="confirm-dialog-title">
            <h2 id="confirm-dialog-title" className="text-lg font-semibold">{title}</h2>
            <div className="mt-3 text-sm">{children}</div>
            {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
            <div className="mt-5 flex flex-wrap justify-end gap-3">
                <button type="button" onClick={onCancel} disabled={busy}
                    className="min-h-11 rounded-lg border border-stone-400 px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">
                    Cancel
                </button>
                <button type="button" onClick={onConfirm} disabled={busy || confirmDisabled}
                    className={`min-h-11 rounded-lg px-4 py-2 text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 ${danger ? "bg-red-700" : "bg-[#9e5220]"}`}>
                    {confirmLabel}
                </button>
            </div>
        </dialog>
    );
}

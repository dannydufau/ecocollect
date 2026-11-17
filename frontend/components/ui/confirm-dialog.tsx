"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./button";

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
    const titleId = useId();

    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) dialog.close();
    }, [open]);

    return (
        <dialog ref={ref} onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}
            className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-[32px] bg-surface p-5 text-text shadow-[0_12px_32px_rgba(46,43,37,0.22)] backdrop:bg-neutral-900/50"
            aria-labelledby={titleId} aria-busy={busy}>
            <h2 id={titleId} className="text-xl">{title}</h2>
            <div className="mt-3">{open && children}</div>
            {error && <p role="alert" className="mt-3 text-[13px] font-semibold text-danger">{error}</p>}
            <div className="mt-5 flex flex-wrap justify-end gap-3">
                <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
                <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy || confirmDisabled}>{confirmLabel}</Button>
            </div>
        </dialog>
    );
}

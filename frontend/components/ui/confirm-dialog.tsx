"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "./button";

type Props = {
    open: boolean;
    title: string;
    children: ReactNode;
    confirmLabel: string;
    cancelLabel?: string;
    confirmDisabled?: boolean;
    blocked?: string;
    busy?: boolean;
    error?: string;
    danger?: boolean;
    size?: "md" | "lg";
    onConfirm: () => void;
    onCancel: () => void;
};

export function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel = "Cancel", confirmDisabled = false,
    blocked, busy = false, error, danger = false, size = "md", onConfirm, onCancel }: Props) {
    const ref = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    const blockedId = useId();
    const reason = confirmDisabled ? blocked : undefined;
    const [showContent, setShowContent] = useState(open);
    if (open && !showContent) setShowContent(true);

    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) {
            dialog.close();
            let reopened = false;
            const transitions = dialog.getAnimations?.() ?? [];
            void Promise.allSettled(transitions.map(transition => transition.finished)).then(() => {
                if (!reopened) setShowContent(false);
            });
            return () => { reopened = true; };
        }
    }, [open]);

    return (
        <dialog ref={ref} onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}
            className={`confirm-dialog m-auto max-h-[90dvh] w-[calc(100%-2rem)] ${size === "lg" ? "max-w-xl" : "max-w-md"} flex-col overflow-hidden rounded-2xl bg-surface-elevated p-5 text-text shadow-dialog`}
            aria-labelledby={titleId} aria-busy={busy}>
            <h2 id={titleId} className="shrink-0">{title}</h2>
            <div className="mt-3 min-h-0 overflow-y-auto overscroll-contain">{showContent && children}</div>
            <footer className="mt-4 shrink-0 space-y-2">
                {error && <p role="alert" className="text-small font-semibold text-danger">{error}</p>}
                {reason && <p id={blockedId} className="text-small font-semibold text-text-muted">{reason}</p>}
                <div className="flex flex-wrap justify-end gap-3">
                    <Button variant="secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
                    <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy || confirmDisabled}
                        aria-describedby={reason ? blockedId : undefined}>{confirmLabel}</Button>
                </div>
            </footer>
        </dialog>
    );
}

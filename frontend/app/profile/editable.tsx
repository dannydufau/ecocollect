"use client";

import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { Alert, Button } from "@/components/ui";

// A read view with an Edit button, or a small form with Save and Cancel. The cards decide what goes inside.
export function Editable({ id, editLabel, open, onOpen, onClose, saving, message, onSubmit, read, fields }: {
    id: string;
    editLabel: string;
    open: boolean;
    onOpen: () => void;
    onClose: () => void;
    saving: boolean;
    message: string;
    onSubmit: () => void;
    read: ReactNode;
    fields: ReactNode;
}) {
    // After Save or Cancel the focus goes back to the Edit button, so a keyboard user is not lost
    const wasOpen = useRef(false);
    useEffect(() => {
        if (wasOpen.current && !open) document.getElementById(`edit-${id}`)?.focus();
        wasOpen.current = open;
    }, [open, id]);

    if (!open) {
        return (
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">{read}</div>
                <Button id={`edit-${id}`} variant="secondary" aria-label={editLabel} onClick={onOpen}>Edit</Button>
            </div>
        );
    }

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!saving) onSubmit();
    }

    return (
        <form onSubmit={submit} noValidate className="space-y-4">
            {message && <Alert variant="error">{message}</Alert>}
            {fields}
            <div className="flex flex-wrap gap-3">
                <Button type="submit" busy={saving} busyLabel="Saving...">Save</Button>
                <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            </div>
        </form>
    );
}

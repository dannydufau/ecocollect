"use client";

import { useEffect } from "react";

// Prompts before reload or tab close when the user has unsaved form input.
export function useUnsavedWarning(dirty: boolean) {
    useEffect(() => {
        if (!dirty) return;
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [dirty]);
}

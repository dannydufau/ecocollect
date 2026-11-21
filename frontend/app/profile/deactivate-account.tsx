"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Button, ConfirmDialog, WarningIcon, panel } from "@/components/ui";
import { api, friendlyError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export function DeactivateAccount() {
    const { signOut } = useAuth();
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const deactivate = useMutation({
        mutationFn: async () => {
            await api.delete("/api/profile");
            // The server has already ended the session and disabled the login, so its calls would only fail (README 7.4)
            await signOut({ skipServer: true });
        },
        onSuccess: () => router.replace("/login"),
    });

    return (
        <section className={`${panel} mt-6 min-w-0 space-y-3 border-danger-border bg-transparent`} aria-labelledby="deactivate-account">
            <h2 id="deactivate-account" className="flex items-center gap-2 text-[22px] text-danger"><WarningIcon className="size-5" />Deactivate account</h2>
            <p>You will be signed out and you can&apos;t sign in again. Your history is kept.</p>
            <div><Button variant="danger-outline" onClick={() => { deactivate.reset(); setOpen(true); }}>Deactivate account</Button></div>
            <ConfirmDialog open={open} title="Deactivate your account?" danger
                confirmLabel={deactivate.isPending ? "Deactivating..." : "Deactivate account"} cancelLabel="Keep account"
                busy={deactivate.isPending} error={deactivate.error ? friendlyError(deactivate.error) : undefined}
                onConfirm={() => { if (!deactivate.isPending) deactivate.mutate(); }}
                onCancel={() => setOpen(false)}>
                <p>You will be signed out and you can&apos;t sign in again. Your history is kept. This can&apos;t be undone.</p>
            </ConfirmDialog>
        </section>
    );
}

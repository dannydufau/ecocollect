"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Button, ConfirmDialog, card } from "@/components/ui";
import { api, ApiError, friendlyError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export function DeactivateAccount() {
    const { signOut } = useAuth();
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const deactivate = useMutation({
        mutationFn: async () => {
            await api.delete("/api/profile");
            await signOut();
        },
        onSuccess: () => router.replace("/login"),
    });
    const error = deactivate.error && (deactivate.error instanceof ApiError && deactivate.error.code === "active_work"
        ? "Finish or cancel your open requests and assignments first."
        : friendlyError(deactivate.error));

    return (
        <section className={`${card} space-y-3`} aria-labelledby="deactivate-account">
            <h2 id="deactivate-account" className="text-2xl">Deactivate account</h2>
            <p className="text-neutral-800">Your account and public profile go away and you are signed out.</p>
            <Button variant="danger-outline" onClick={() => { deactivate.reset(); setOpen(true); }}>Deactivate account</Button>
            <ConfirmDialog open={open} title="Deactivate your account?" danger
                confirmLabel={deactivate.isPending ? "Deactivating..." : "Deactivate account"} cancelLabel="Keep my account"
                busy={deactivate.isPending} error={error || undefined}
                onConfirm={() => { if (!deactivate.isPending) deactivate.mutate(); }}
                onCancel={() => setOpen(false)}>
                <p>This cannot be undone. You will be signed out and will not be able to log in with this account again.</p>
            </ConfirmDialog>
        </section>
    );
}

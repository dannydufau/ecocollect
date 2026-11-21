"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import TermsCheckbox from "@/components/terms-checkbox";
import { AddressFields, PostalCodeList } from "@/components/address-fields";
import { Alert, Button, panel } from "@/components/ui";
import { api, ApiError, friendlyError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { queryKeys } from "@/lib/query-keys";
import type { ActivateRole, Profile } from "@/lib/types";
import { normalizePostalCode, validateAddress, validateCodes } from "@/lib/validate-account";
import type { Notice } from "./notice";

const roleNames = { resident: "resident", volunteer: "volunteer" };

export function SecondRole({ profile, onDone }: { profile: Profile; onDone: (notice: Notice) => void }) {
    const { refreshRoles } = useAuth();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [street, setStreet] = useState("");
    const [postalCode, setPostalCode] = useState("");
    const [codes, setCodes] = useState<string[]>([]);
    const [termsId, setTermsId] = useState<string | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [message, setMessage] = useState("");
    const resident = profile.roles.includes("resident");
    const role = resident === profile.roles.includes("volunteer") ? null : resident ? "volunteer" : "resident";

    const activate = useMutation({
        mutationFn: async (body: ActivateRole) => {
            await api.post("/api/profile/roles", body);
            // The new role only works with a fresh token and session (README 3.3)
            return refreshRoles().then(() => true, () => false);
        },
        onSuccess: (refreshed) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.profile });
            if (!role) return;
            onDone(refreshed
                ? { variant: "success", text: `You can now use EcoCollect as a ${roleNames[role]}.` }
                : { variant: "warning", text: `You are now a ${roleNames[role]}, but we could not refresh your session. Please reload the page.` });
        },
    });

    if (!role) return null;

    function start() {
        setStreet("");
        setPostalCode("");
        setCodes([]);
        setTermsId(null);
        setErrors({});
        setMessage("");
        setOpen(true);
    }

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (activate.isPending || !termsId || !role) return;
        const found = role === "resident" ? validateAddress(street, postalCode) : validateCodes(codes);
        setErrors(found);
        setMessage("");
        if (Object.keys(found).length) return;

        const body: ActivateRole = role === "resident"
            ? { role, termsDocumentId: termsId, address: { street: street.trim(), postalCode: normalizePostalCode(postalCode) } }
            : { role, termsDocumentId: termsId, preferredPostalCodes: codes.map(normalizePostalCode).filter(Boolean) };
        activate.mutate(body, {
            onError: (error) => {
                if (error instanceof ApiError && error.code === "role_already_active") {
                    void queryClient.invalidateQueries({ queryKey: queryKeys.profile });
                    onDone({ variant: "info", text: friendlyError(error) });
                    return;
                }
                if (error instanceof ApiError && error.code === "terms_outdated") void queryClient.invalidateQueries({ queryKey: queryKeys.terms });
                if (error instanceof ApiError && error.status === 400 && Object.keys(error.fields).length) setErrors(error.fields);
                else setMessage(friendlyError(error));
            },
        });
    }

    const name = role === "volunteer" ? "Become a volunteer" : "Become a resident";
    if (!open) {
        return (
            <section className={`${panel} min-w-0 space-y-3 border-border bg-accent-2-200`} aria-labelledby="second-role">
                <h2 id="second-role" className="text-[22px]">Add a role</h2>
                <p>{role === "volunteer" ? "You can also pick up items near you and deliver them to a facility." : "You can also request pickups for your own e-waste."}</p>
                <div><Button onClick={start}>{name}</Button></div>
            </section>
        );
    }

    return (
        <form onSubmit={submit} noValidate aria-labelledby="second-role" className={`${panel} min-w-0 space-y-4 border-border bg-accent-2-200`}>
            <h2 id="second-role" className="text-[22px]">{name}</h2>
            {role === "resident" && <AddressFields street={street} postalCode={postalCode} errors={errors} onStreet={setStreet} onPostalCode={setPostalCode} />}
            {role === "volunteer" && <div className="space-y-3">
                <p className="font-semibold">Preferred postal codes (optional, up to 3)</p>
                <PostalCodeList codes={codes} errors={errors} onChange={setCodes} />
            </div>}
            <TermsCheckbox value={termsId} onChange={setTermsId} />
            {message && <Alert variant="error">{message}</Alert>}
            <div className="flex flex-wrap gap-3">
                <Button type="submit" busy={activate.isPending} busyLabel="Adding the role..." disabled={!termsId}>Activate role</Button>
                <Button variant="secondary" onClick={() => setOpen(false)} disabled={activate.isPending}>Cancel</Button>
            </div>
        </form>
    );
}

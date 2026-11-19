"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import TermsCheckbox from "@/components/terms-checkbox";
import { Alert, Button, Field, card, input } from "@/components/ui";
import { api, ApiError, friendlyError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { queryKeys } from "@/lib/query-keys";
import type { ActivateRole, Profile } from "@/lib/types";
import { normalizePostalCode, validateAccount } from "@/lib/validate-account";

export function SecondRole({ profile }: { profile: Profile }) {
    const { refreshRoles } = useAuth();
    const queryClient = useQueryClient();
    const [street, setStreet] = useState("");
    const [postalCode, setPostalCode] = useState("");
    const [codes, setCodes] = useState<string[]>([]);
    const [termsId, setTermsId] = useState<string | null>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [message, setMessage] = useState("");
    const [alreadyActive, setAlreadyActive] = useState(false);
    const resident = profile.roles.includes("resident");
    const role = resident === profile.roles.includes("volunteer") ? null : resident ? "volunteer" : "resident";

    const activate = useMutation({
        mutationFn: async (body: ActivateRole) => {
            await api.post("/api/profile/roles", body);
            // The new role only works with a fresh token and session (README 3.3)
            await refreshRoles();
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.profile }),
    });

    if (alreadyActive) return <Alert variant="info">You already have this role.</Alert>;
    if (!role) return null;

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (activate.isPending || !termsId || !role) return;
        // validateAccount checks the whole register form, only the address or code errors matter here
        const found = Object.fromEntries(Object.entries(validateAccount({
            username: "", email: "", password: "", firstName: "", lastName: "", publicName: "", dateOfBirth: "",
            role, street, postalCode, preferredPostalCodes: codes,
        }, "")).filter(([key]) => /^(address\.|preferredPostalCodes)/.test(key)));
        setErrors(found);
        setMessage("");
        if (Object.keys(found).length) return;

        const body: ActivateRole = role === "resident"
            ? { role, termsDocumentId: termsId, address: { street: street.trim(), postalCode: normalizePostalCode(postalCode) } }
            : { role, termsDocumentId: termsId, preferredPostalCodes: codes.map(normalizePostalCode).filter(Boolean) };
        activate.mutate(body, {
            onError: (error) => {
                if (error instanceof ApiError && error.code === "role_already_active") {
                    setAlreadyActive(true);
                    queryClient.invalidateQueries({ queryKey: queryKeys.profile });
                } else if (error instanceof ApiError && error.code === "terms_outdated") {
                    queryClient.invalidateQueries({ queryKey: queryKeys.terms });
                    setMessage("The terms changed. Please read and accept them again.");
                } else if (error instanceof ApiError && error.status === 400 && Object.keys(error.fields).length) {
                    setErrors(error.fields);
                } else {
                    setMessage(friendlyError(error));
                }
            },
        });
    }

    return (
        <form onSubmit={submit} noValidate aria-labelledby="second-role" className={`${card} min-w-0 space-y-4`}>
            <h2 id="second-role" className="text-2xl">{role === "volunteer" ? "Become a volunteer" : "Become a resident"}</h2>
            <p className="text-neutral-800">
                {role === "volunteer" ? "Pick up items near you and deliver them to a facility." : "Request pickups for your own e-waste."}
            </p>
            {role === "resident" && <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Street" error={errors["address.street"] ?? errors.address}>
                    {(control) => <input {...control} type="text" autoComplete="street-address" value={street} className={input}
                        onChange={(event) => setStreet(event.target.value)} />}
                </Field>
                <Field label="Postal code" hint="Calgary postal codes only, for example T2P 1J9" error={errors["address.postalCode"]}>
                    {(control) => <input {...control} type="text" autoComplete="postal-code" value={postalCode} className={input}
                        onChange={(event) => setPostalCode(event.target.value)} />}
                </Field>
            </div>}
            {role === "volunteer" && <div className="space-y-3">
                <p className="font-semibold">Preferred postal codes (optional, up to 3)</p>
                {errors.preferredPostalCodes && <p role="alert" className="text-[13px] font-semibold text-danger">{errors.preferredPostalCodes}</p>}
                {codes.map((code, index) => <div key={index} className="flex items-end gap-3">
                    <div className="min-w-0 flex-1">
                        <Field label={`Postal code ${index + 1}`} error={errors[`preferredPostalCodes[${index}]`]}>
                            {(control) => <input {...control} type="text" autoComplete="off" value={code} className={input}
                                onChange={(event) => setCodes(codes.map((old, i) => (i === index ? event.target.value : old)))} />}
                        </Field>
                    </div>
                    <Button variant="secondary" aria-label={`Remove postal code ${index + 1}`}
                        onClick={() => setCodes(codes.filter((_, i) => i !== index))}>Remove</Button>
                </div>)}
                <Button variant="secondary" disabled={codes.length >= 3} onClick={() => setCodes([...codes, ""])}>Add postal code</Button>
            </div>}
            <TermsCheckbox value={termsId} onChange={setTermsId} />
            {message && <Alert variant="error">{message}</Alert>}
            <Button type="submit" busy={activate.isPending} busyLabel="Adding the role..." disabled={!termsId}>
                {role === "volunteer" ? "Become a volunteer" : "Become a resident"}
            </Button>
        </form>
    );
}

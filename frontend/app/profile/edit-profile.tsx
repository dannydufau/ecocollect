"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Field, card, input } from "@/components/ui";
import { api, ApiError, friendlyError } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { Profile } from "@/lib/types";
import { normalizePostalCode, validateAccount } from "@/lib/validate-account";

type Values = { publicName: string; street: string; postalCode: string; codes: string[] };
type Edit = { publicName?: string; address?: { street: string; postalCode: string }; preferredPostalCodes?: string[] };

// validateAccount checks one role at a time. The fields this form does not have are left blank and their errors dropped.
function check(values: Values, role: "resident" | "volunteer"): Record<string, string> {
    const errors = validateAccount({
        username: "", email: "", password: "", firstName: "", lastName: "", dateOfBirth: "",
        publicName: values.publicName, role, street: values.street, postalCode: values.postalCode, preferredPostalCodes: values.codes,
    }, "");
    return Object.fromEntries(Object.entries(errors).filter(([key]) => /^(publicName|address\.|preferredPostalCodes)/.test(key)));
}

export function EditProfile({ profile }: { profile: Profile }) {
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [values, setValues] = useState<Values>({ publicName: "", street: "", postalCode: "", codes: [] });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [message, setMessage] = useState("");
    const resident = profile.roles.includes("resident");
    const volunteer = profile.roles.includes("volunteer");

    const save = useMutation({
        mutationFn: (body: Edit) => api.patch<Profile>("/api/profile", body),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.profile }),
    });

    function start() {
        setValues({
            publicName: profile.publicName,
            street: profile.address?.street ?? "",
            postalCode: profile.address?.postalCode ?? "",
            codes: profile.preferredPostalCodes,
        });
        setErrors({});
        setMessage("");
        setOpen(true);
    }

    function change(patch: Partial<Values>) {
        setValues((current) => ({ ...current, ...patch }));
    }

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (save.isPending) return;
        const found = Object.assign({}, ...profile.roles.map((role) => check(values, role)));
        setErrors(found);
        setMessage("");
        if (Object.keys(found).length) return;

        const body: Edit = {};
        const publicName = values.publicName.trim();
        if (publicName !== profile.publicName) body.publicName = publicName;
        const address = { street: values.street.trim(), postalCode: normalizePostalCode(values.postalCode) };
        if (resident && (address.street !== profile.address?.street || address.postalCode !== profile.address?.postalCode)) body.address = address;
        const codes = values.codes.map(normalizePostalCode).filter(Boolean);
        if (volunteer && codes.join() !== profile.preferredPostalCodes.join()) body.preferredPostalCodes = codes;
        if (!Object.keys(body).length) return setOpen(false);

        save.mutate(body, {
            onSuccess: () => setOpen(false),
            onError: (error) => {
                if (error instanceof ApiError && error.code === "address_locked") setMessage("You can't change your address while you have an open or assigned request.");
                else if (error instanceof ApiError && error.status === 400 && Object.keys(error.fields).length) setErrors(error.fields);
                else setMessage(friendlyError(error));
            },
        });
    }

    if (!open) return <div><Button variant="secondary" onClick={start}>Edit profile</Button></div>;

    return (
        <form onSubmit={submit} noValidate aria-labelledby="edit-profile" className={`${card} min-w-0 space-y-4`}>
            <h2 id="edit-profile" className="text-2xl">Edit profile</h2>
            {message && <Alert variant="error">{message}</Alert>}
            <Field label="Public name" hint="Other people see this name." error={errors.publicName}>
                {(control) => <input {...control} type="text" autoComplete="nickname" value={values.publicName} className={input}
                    onChange={(event) => change({ publicName: event.target.value })} />}
            </Field>
            {resident && <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Street" error={errors["address.street"]}>
                    {(control) => <input {...control} type="text" autoComplete="street-address" value={values.street} className={input}
                        onChange={(event) => change({ street: event.target.value })} />}
                </Field>
                <Field label="Postal code" hint="Calgary postal codes only, for example T2P 1J9" error={errors["address.postalCode"]}>
                    {(control) => <input {...control} type="text" autoComplete="postal-code" value={values.postalCode} className={input}
                        onChange={(event) => change({ postalCode: event.target.value })} />}
                </Field>
            </div>}
            {volunteer && <div className="space-y-3">
                <p className="font-semibold">Preferred postal codes (up to 3)</p>
                {errors.preferredPostalCodes && <p role="alert" className="text-[13px] font-semibold text-danger">{errors.preferredPostalCodes}</p>}
                {values.codes.map((code, index) => <div key={index} className="flex items-end gap-3">
                    <div className="min-w-0 flex-1">
                        <Field label={`Postal code ${index + 1}`} error={errors[`preferredPostalCodes[${index}]`]}>
                            {(control) => <input {...control} type="text" autoComplete="off" value={code} className={input}
                                onChange={(event) => change({ codes: values.codes.map((old, i) => (i === index ? event.target.value : old)) })} />}
                        </Field>
                    </div>
                    <Button variant="secondary" aria-label={`Remove postal code ${index + 1}`}
                        onClick={() => change({ codes: values.codes.filter((_, i) => i !== index) })}>Remove</Button>
                </div>)}
                <Button variant="secondary" disabled={values.codes.length >= 3} onClick={() => change({ codes: [...values.codes, ""] })}>Add postal code</Button>
            </div>}
            <div className="flex flex-wrap gap-3">
                <Button type="submit" busy={save.isPending} busyLabel="Saving...">Save</Button>
                <Button variant="secondary" onClick={() => setOpen(false)} disabled={save.isPending}>Cancel</Button>
            </div>
        </form>
    );
}

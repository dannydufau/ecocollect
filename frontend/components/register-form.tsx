"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AddressFields, PostalCodeList } from "@/components/address-fields";
import { Button, CheckIcon, Field, FieldError, PasswordInput, card, input, textLink } from "@/components/ui";
import { calgaryToday } from "@/lib/time";
import {
    eighteenYearsAgo, normalizeUsername, validateAccount, type AccountValues,
} from "@/lib/validate-account";

// A card with its title inside, like the prototype. The legend floats so it sits in the card and not on its border.
function Group({ title, children }: { title: string; children: ReactNode }) {
    return <fieldset className={`${card} min-w-0`}>
        <legend className="float-left mb-3 text-title font-bold">{title}</legend>
        <div className="clear-both flex flex-col gap-4">{children}</div>
    </fieldset>;
}

export default function RegisterForm({ onValid, fieldErrors = {}, busy = false, submitDisabled = false, submitHint, onEdit, children }: {
    onValid?: (values: AccountValues) => void;
    fieldErrors?: Record<string, string>;
    busy?: boolean;
    submitDisabled?: boolean;
    submitHint?: string;
    onEdit?: () => void;
    children?: ReactNode;
}) {
    const id = useId();
    const [values, setValues] = useState<AccountValues>({
        username: "", email: "", password: "", firstName: "", lastName: "", publicName: "",
        dateOfBirth: "", role: "", street: "", postalCode: "", preferredPostalCodes: [],
    });
    const [tried, setTried] = useState(false);
    const [failedSubmits, setFailedSubmits] = useState(0);
    const formRef = useRef<HTMLFormElement>(null);
    const today = calgaryToday();
    // Errors only show after the first submit, then follow the values as the user types
    const errors = { ...(tried ? validateAccount(values, today) : {}), ...fieldErrors };

    // Move focus to the first problem once the errors are on screen, for our checks and for the server's
    const serverErrorKeys = Object.keys(fieldErrors).join();
    useEffect(() => {
        if (failedSubmits || serverErrorKeys) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"][tabindex]')?.focus();
    }, [failedSubmits, serverErrorKeys]);

    function change(patch: Partial<AccountValues>) {
        setValues(current => ({ ...current, ...patch }));
        onEdit?.();
    }

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy || submitDisabled) return;
        setTried(true);
        if (Object.keys(validateAccount(values, today)).length) setFailedSubmits(count => count + 1);
        else onValid?.(values);
    }

    // A small helper for the plain text inputs, they only differ in label, type and autocomplete
    function text(name: "firstName" | "lastName" | "publicName" | "username" | "email", label: string, autoComplete: string, extra: { hint?: string; type?: string } = {}) {
        return <Field label={label} hint={extra.hint} error={errors[name]}>
            {control => <input {...control} type={extra.type ?? "text"} autoComplete={autoComplete} value={values[name]} className={input}
                onChange={event => change({ [name]: event.target.value })}
                onBlur={name === "username" && normalizeUsername(values.username) !== values.username ? () => change({ username: normalizeUsername(values.username) }) : undefined} />}
        </Field>;
    }

    return (
        <form ref={formRef} onSubmit={submit} aria-busy={busy} noValidate className="min-w-0 space-y-8">
            <fieldset disabled={busy} className="min-w-0 space-y-8">
                <Group title="About you">
                    <div className="grid gap-4 sm:grid-cols-2">
                        {text("firstName", "First name", "given-name")}
                        {text("lastName", "Last name", "family-name")}
                    </div>
                    <Field label="Date of birth" error={errors.dateOfBirth}>
                        {control => <input {...control} type="date" autoComplete="bday" max={eighteenYearsAgo(today)} value={values.dateOfBirth} className={input}
                            onChange={event => change({ dateOfBirth: event.target.value })} />}
                    </Field>
                    {text("publicName", "Public name", "nickname", { hint: "Other people see this name." })}
                </Group>

                <Group title="Account">
                    {text("username", "Username", "username", { hint: "3 to 50 characters: a to z, 0 to 9, _ and -. You can't change it later." })}
                    {text("email", "Email", "email", { type: "email" })}
                    <Field label="Password" hint="Use at least 6 characters." error={errors.password}>
                        {control => <PasswordInput {...control} autoComplete="new-password" value={values.password}
                            onChange={event => change({ password: event.target.value })} />}
                    </Field>
                </Group>

                <Group title="Your role">
                    <fieldset aria-describedby={errors.role ? `${id}-role-error` : undefined} className="min-w-0">
                        <legend className="mb-2 font-semibold">I want to</legend>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {([["resident", "Request pickups (Resident)"], ["volunteer", "Collect and deliver items (Volunteer)"]] as const).map(([role, label]) => {
                                const selected = values.role === role;
                                return <label key={role} className={`relative flex min-h-11 cursor-pointer items-center gap-3 rounded-xl p-4 has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-700 ${selected ? "border-2 border-accent-700 bg-accent-100 font-semibold" : "border border-border-strong"}`}>
                                    <input type="radio" name={`${id}-role`} value={role} checked={selected} onChange={() => change({ role })} className="sr-only" />
                                    <span aria-hidden="true" className={`inline-flex size-6 flex-none items-center justify-center rounded-full border ${selected ? "border-accent-700 bg-accent-700 text-on-accent" : "border-border-strong"}`}>
                                        {selected && <CheckIcon className="size-4" />}
                                    </span>
                                    {label}
                                </label>;
                            })}
                        </div>
                    </fieldset>
                    <p className="text-text-muted">You can add the other role later in your profile.</p>
                    {errors.role && <FieldError id={`${id}-role-error`} tabIndex={-1}>{errors.role}</FieldError>}
                </Group>

                {values.role === "resident" && <Group title="Role details">
                    <AddressFields street={values.street} postalCode={values.postalCode} errors={errors}
                        onStreet={street => change({ street })} onPostalCode={postalCode => change({ postalCode })} />
                </Group>}

                {values.role === "volunteer" && <Group title="Role details">
                    <p className="font-semibold">Preferred postal codes (optional, up to 3)</p>
                    <p className="text-text-muted">You get notifications for new requests in these areas. You can change them later.</p>
                    <PostalCodeList codes={values.preferredPostalCodes} errors={errors} onChange={preferredPostalCodes => change({ preferredPostalCodes })} />
                </Group>}

                {children}
                <div className="flex flex-wrap items-center gap-4">
                    <Button type="submit" busy={busy} busyLabel="Creating account..." disabled={submitDisabled} aria-describedby={submitHint ? `${id}-submit-hint` : undefined} className="px-7">Create account</Button>
                    {submitHint && <p id={`${id}-submit-hint`} className="text-small text-text-muted">{submitHint}</p>}
                    <Link href="/login" className={textLink}>Already have an account? Sign in</Link>
                </div>
            </fieldset>
        </form>
    );
}

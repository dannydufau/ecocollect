"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button, Field, card, input, textLink } from "@/components/ui";
import { calgaryToday } from "@/lib/time";
import {
    eighteenYearsAgo, normalizePostalCode, normalizeUsername, validateAccount, type AccountValues,
} from "@/lib/validate-account";

// A card with its title inside, like the prototype. The legend floats so it sits in the card and not on its border.
function Group({ title, describedBy, children }: { title: string; describedBy?: string; children: ReactNode }) {
    return <fieldset aria-describedby={describedBy} className={`${card} min-w-0`}>
        <legend className="float-left mb-3 font-[family-name:var(--font-heading)] text-xl">{title}</legend>
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

    // Tidies a value when the user leaves the field. It only counts as an edit when something changed.
    function tidy(name: "username" | "postalCode", clean: (value: string) => string) {
        if (clean(values[name]) !== values[name]) change({ [name]: clean(values[name]) });
    }

    function changeCode(index: number, code: string) {
        change({ preferredPostalCodes: values.preferredPostalCodes.map((old, i) => i === index ? code : old) });
    }

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy || submitDisabled) return;
        setTried(true);
        if (Object.keys(validateAccount(values, today)).length) setFailedSubmits(count => count + 1);
        else onValid?.(values);
    }

    // A small helper for the plain text inputs, they only differ in label, type and autocomplete
    function text(name: "firstName" | "lastName" | "publicName" | "username" | "email" | "password", label: string, autoComplete: string, extra: { hint?: string; type?: string } = {}) {
        return <Field label={label} hint={extra.hint} error={errors[name]}>
            {control => <input {...control} type={extra.type ?? "text"} autoComplete={autoComplete} value={values[name]} className={input}
                onChange={event => change({ [name]: event.target.value })}
                onBlur={name === "username" ? () => tidy("username", normalizeUsername) : undefined} />}
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
                    {text("password", "Password", "new-password", { type: "password" })}
                </Group>

                <Group title="I want to" describedBy={errors.role ? `${id}-role-error` : undefined}>
                    {([["resident", "Request pickups (Resident)"], ["volunteer", "Collect and deliver items (Volunteer)"]] as const).map(([role, label]) =>
                        <label key={role} className="flex min-h-11 items-center gap-3">
                            <input type="radio" name={`${id}-role`} value={role} checked={values.role === role} onChange={() => change({ role })} className="size-5 accent-accent" />
                            {label}
                        </label>)}
                    <p className="text-neutral-700">You can add the other role later in your profile.</p>
                    {errors.role && <p id={`${id}-role-error`} role="alert" tabIndex={-1} className="font-semibold text-danger">{errors.role}</p>}
                </Group>

                {values.role === "resident" && <Group title="Role details">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Street" error={errors["address.street"]}>
                            {control => <input {...control} type="text" autoComplete="street-address" value={values.street} className={input}
                                onChange={event => change({ street: event.target.value })} />}
                        </Field>
                        <Field label="Postal code" hint="Calgary postal codes only, for example T2P 1J9" error={errors["address.postalCode"]}>
                            {control => <input {...control} type="text" autoComplete="postal-code" value={values.postalCode} className={input}
                                onChange={event => change({ postalCode: event.target.value })}
                                onBlur={() => tidy("postalCode", normalizePostalCode)} />}
                        </Field>
                    </div>
                </Group>}

                {values.role === "volunteer" && <Group title="Role details">
                    <p className="font-semibold">Preferred postal codes (optional, up to 3)</p>
                    <p className="text-neutral-700">You get notifications for new requests in these areas. You can change them later.</p>
                    {errors.preferredPostalCodes && <p role="alert" tabIndex={-1} className="font-semibold text-danger">{errors.preferredPostalCodes}</p>}
                    {values.preferredPostalCodes.map((code, index) => <div key={index} className="flex items-end gap-3">
                        <div className="min-w-0 flex-1">
                            <Field label={`Postal code ${index + 1}`} error={errors[`preferredPostalCodes[${index}]`]}>
                                {control => <input {...control} type="text" autoComplete="off" value={code} className={input}
                                    onChange={event => changeCode(index, event.target.value)}
                                    onBlur={() => normalizePostalCode(code) !== code && changeCode(index, normalizePostalCode(code))} />}
                            </Field>
                        </div>
                        <Button variant="secondary" aria-label={`Remove postal code ${index + 1}`}
                            onClick={() => change({ preferredPostalCodes: values.preferredPostalCodes.filter((_, i) => i !== index) })}>Remove</Button>
                    </div>)}
                    <div>
                        <Button variant="secondary" disabled={values.preferredPostalCodes.length >= 3}
                            onClick={() => change({ preferredPostalCodes: [...values.preferredPostalCodes, ""] })}>Add postal code</Button>
                    </div>
                </Group>}

                {children}
                <div className="flex flex-wrap items-center gap-4">
                    <Button type="submit" busy={busy} busyLabel="Creating account..." disabled={submitDisabled} aria-describedby={submitHint ? `${id}-submit-hint` : undefined} className="px-7">Create account</Button>
                    {submitHint && <p id={`${id}-submit-hint`} className="text-[13px] text-neutral-700">{submitHint}</p>}
                    <Link href="/login" className={textLink}>Already have an account? Sign in</Link>
                </div>
            </fieldset>
        </form>
    );
}

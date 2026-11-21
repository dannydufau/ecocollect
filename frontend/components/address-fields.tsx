"use client";

import { Button, Field, input } from "@/components/ui";
import { normalizePostalCode } from "@/lib/validate-account";

type Errors = Record<string, string>;

export function AddressFields({ street, postalCode, errors, onStreet, onPostalCode }: {
    street: string;
    postalCode: string;
    errors: Errors;
    onStreet: (street: string) => void;
    onPostalCode: (postalCode: string) => void;
}) {
    return (
        <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Street" error={errors["address.street"] ?? errors.address}>
                {(control) => <input {...control} type="text" autoComplete="street-address" value={street} className={input}
                    onChange={(event) => onStreet(event.target.value)} />}
            </Field>
            <Field label="Postal code" hint="Calgary postal codes only, for example T2P 1J9" error={errors["address.postalCode"]}>
                {(control) => <input {...control} type="text" autoComplete="postal-code" value={postalCode} className={input}
                    onChange={(event) => onPostalCode(event.target.value)}
                    onBlur={() => { if (normalizePostalCode(postalCode) !== postalCode) onPostalCode(normalizePostalCode(postalCode)); }} />}
            </Field>
        </div>
    );
}

export function PostalCodeList({ codes, errors, onChange }: { codes: string[]; errors: Errors; onChange: (codes: string[]) => void }) {
    const setCode = (index: number, code: string) => onChange(codes.map((old, i) => (i === index ? code : old)));
    return (
        <div className="space-y-3">
            {errors.preferredPostalCodes && <p role="alert" tabIndex={-1} className="text-[13px] font-semibold text-danger">{errors.preferredPostalCodes}</p>}
            {codes.map((code, index) => <div key={index} className="flex items-end gap-3">
                <div className="min-w-0 flex-1">
                    <Field label={`Postal code ${index + 1}`} error={errors[`preferredPostalCodes[${index}]`]}>
                        {(control) => <input {...control} type="text" autoComplete="off" value={code} className={input}
                            onChange={(event) => setCode(index, event.target.value)}
                            onBlur={() => { if (normalizePostalCode(code) !== code) setCode(index, normalizePostalCode(code)); }} />}
                    </Field>
                </div>
                <Button variant="secondary" aria-label={`Remove postal code ${index + 1}`}
                    onClick={() => onChange(codes.filter((_, i) => i !== index))}>Remove</Button>
            </div>)}
            <Button variant="secondary" disabled={codes.length >= 3} onClick={() => onChange([...codes, ""])}>Add postal code</Button>
        </div>
    );
}

"use client";

import { useState } from "react";
import { Button, Field, input } from "@/components/ui";
import { ApiError, friendlyError } from "@/lib/api";
import { formatPostalCode } from "@/lib/postal-code";
import type { Profile, ProfileEdit } from "@/lib/types";
import { normalizePostalCode, validateAddress, validateCodes } from "@/lib/validate-account";
import { Editable } from "./editable";
import { useSaveProfile } from "./use-save-profile";

type EditorProps = { profile: Profile; open: boolean; onOpen: () => void; onClose: () => void; onSaved: () => void };

// The three editors share this: check, send only what changed, and show what the server says
function useEditor(props: EditorProps) {
    const save = useSaveProfile();
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [message, setMessage] = useState("");

    function send(found: Record<string, string>, body: ProfileEdit) {
        setErrors(found);
        setMessage("");
        if (Object.keys(found).length) return;
        if (!Object.keys(body).length) return props.onClose();
        save.mutate(body, {
            onSuccess: props.onSaved,
            onError: (error) => {
                if (error instanceof ApiError && error.status === 400 && Object.keys(error.fields).length) setErrors(error.fields);
                else setMessage(friendlyError(error));
            },
        });
    }

    function reset() {
        setErrors({});
        setMessage("");
    }

    return { save, errors, message, send, reset };
}

export function PublicNameEditor(props: EditorProps) {
    const { profile, open, onOpen, onClose } = props;
    const { save, errors, message, send, reset } = useEditor(props);
    const [name, setName] = useState(profile.publicName);

    return (
        <Editable id="public-name" editLabel="Edit public name" open={open} saving={save.isPending} message={message}
            onOpen={() => { setName(profile.publicName); reset(); onOpen(); }} onClose={onClose}
            onSubmit={() => {
                const publicName = name.trim();
                send(publicName ? {} : { publicName: "Enter a public name." }, publicName !== profile.publicName ? { publicName } : {});
            }}
            read={<><p className="text-[13px] text-neutral-700">Public name</p><p className="break-words">{profile.publicName}</p></>}
            fields={<Field label="Public name" hint="Other people see this name." error={errors.publicName}>
                {(control) => <input {...control} type="text" autoComplete="nickname" value={name} className={input}
                    onChange={(event) => setName(event.target.value)} />}
            </Field>} />
    );
}

export function AddressEditor(props: EditorProps) {
    const { profile, open, onOpen, onClose } = props;
    const { save, errors, message, send, reset } = useEditor(props);
    const address = profile.address;
    const [street, setStreet] = useState(address?.street ?? "");
    const [postalCode, setPostalCode] = useState(address?.postalCode ?? "");

    return (
        <Editable id="address" editLabel="Edit address" open={open} saving={save.isPending} message={message}
            onOpen={() => { setStreet(address?.street ?? ""); setPostalCode(address?.postalCode ?? ""); reset(); onOpen(); }} onClose={onClose}
            onSubmit={() => {
                const next = { street: street.trim(), postalCode: normalizePostalCode(postalCode) };
                const changed = next.street !== address?.street || next.postalCode !== address?.postalCode;
                send(validateAddress(street, postalCode), changed ? { address: next } : {});
            }}
            read={address && <p className="break-words">{address.street}<br />{address.city}, {formatPostalCode(address.postalCode)}</p>}
            fields={<div className="grid gap-4 sm:grid-cols-2">
                <Field label="Street" error={errors["address.street"]}>
                    {(control) => <input {...control} type="text" autoComplete="street-address" value={street} className={input}
                        onChange={(event) => setStreet(event.target.value)} />}
                </Field>
                <Field label="Postal code" hint="Calgary postal codes only, for example T2P 1J9" error={errors["address.postalCode"]}>
                    {(control) => <input {...control} type="text" autoComplete="postal-code" value={postalCode} className={input}
                        onChange={(event) => setPostalCode(event.target.value)} />}
                </Field>
            </div>} />
    );
}

export function CodesEditor(props: EditorProps) {
    const { profile, open, onOpen, onClose } = props;
    const { save, errors, message, send, reset } = useEditor(props);
    const [codes, setCodes] = useState(profile.preferredPostalCodes);

    return (
        <Editable id="codes" editLabel="Edit preferred postal codes" open={open} saving={save.isPending} message={message}
            onOpen={() => { setCodes(profile.preferredPostalCodes); reset(); onOpen(); }} onClose={onClose}
            onSubmit={() => {
                const next = codes.map(normalizePostalCode).filter(Boolean);
                send(validateCodes(codes), next.join() !== profile.preferredPostalCodes.join() ? { preferredPostalCodes: next } : {});
            }}
            read={profile.preferredPostalCodes.length > 0
                ? <ul className="flex flex-wrap gap-2">{profile.preferredPostalCodes.map((code) => (
                    <li key={code} className="rounded-full bg-neutral-100 px-3.5 py-1.5 text-sm">{formatPostalCode(code)}</li>
                ))}</ul>
                : <p>You have no saved codes. You will not get new-request notifications and the list shows every area.</p>}
            fields={<div className="space-y-3">
                <p className="text-neutral-700">Up to 3 codes. You get notifications for new requests in these areas.</p>
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
            </div>} />
    );
}

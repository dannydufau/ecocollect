"use client";

import { useState } from "react";
import { AddressFields, PostalCodeList } from "@/components/address-fields";
import { Field, input, mono } from "@/components/ui";
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
            read={<><p className="text-[13px] text-text-muted">Public name</p><p className="break-words">{profile.publicName}</p></>}
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
            read={address && <p className="break-words">{address.street}<br />{address.city}, <span className={mono}>{formatPostalCode(address.postalCode)}</span></p>}
            fields={<AddressFields street={street} postalCode={postalCode} errors={errors} onStreet={setStreet} onPostalCode={setPostalCode} />} />
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
                    <li key={code} className={`rounded-full bg-neutral-100 px-3.5 py-1.5 ${mono}`}>{formatPostalCode(code)}</li>
                ))}</ul>
                : <p>You have no saved codes. You will not get new-request notifications and the list shows every area.</p>}
            fields={<div className="space-y-3">
                <p className="text-neutral-700">Up to 3 codes. You get notifications for new requests in these areas.</p>
                <PostalCodeList codes={codes} errors={errors} onChange={setCodes} />
            </div>} />
    );
}

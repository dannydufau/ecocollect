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
function useEditor(props: EditorProps, clearDraft: () => void) {
    const save = useSaveProfile();
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [message, setMessage] = useState("");
    // The profile has no lock flag, so the note can only follow the server's answer
    const [locked, setLocked] = useState(false);

    function send(found: Record<string, string>, body: ProfileEdit) {
        setErrors(found);
        setMessage("");
        if (Object.keys(found).length) return;
        if (!Object.keys(body).length) {
            clearDraft();
            return props.onClose();
        }
        save.mutate(body, {
            onSuccess: () => {
                clearDraft();
                setLocked(false);
                props.onSaved();
            },
            onError: (error) => {
                if (error instanceof ApiError && error.code === "address_locked") setLocked(true);
                if (error instanceof ApiError && error.status === 400 && Object.keys(error.fields).length) setErrors(error.fields);
                else setMessage(friendlyError(error));
            },
        });
    }

    function reset() {
        setErrors({});
        setMessage("");
    }

    function cancel() {
        clearDraft();
        reset();
        props.onClose();
    }

    return { save, errors, message, locked, send, reset, cancel };
}

export function PublicNameEditor(props: EditorProps) {
    const { profile, open, onOpen } = props;
    // Null means no typing yet. A draft stays when another card opens, only Save or Cancel clears it.
    const [draft, setDraft] = useState<string | null>(null);
    const { save, errors, message, send, reset, cancel } = useEditor(props, () => setDraft(null));
    const name = draft ?? profile.publicName;

    return (
        <Editable id="public-name" editLabel="Edit public name" open={open} unsaved={draft !== null && draft !== profile.publicName} saving={save.isPending} message={message}
            onOpen={() => { reset(); onOpen(); }} onClose={cancel}
            onSubmit={() => {
                const publicName = name.trim();
                send(publicName ? {} : { publicName: "Enter a public name." }, publicName !== profile.publicName ? { publicName } : {});
            }}
            read={<><p className="text-[13px] text-text-muted">Public name</p><p className="break-words">{profile.publicName}</p></>}
            fields={<Field label="Public name" hint="Other people see this name." error={errors.publicName}>
                {(control) => <input {...control} type="text" autoComplete="nickname" value={name} className={input}
                    onChange={(event) => setDraft(event.target.value)} />}
            </Field>} />
    );
}

export function AddressEditor(props: EditorProps) {
    const { profile, open, onOpen } = props;
    const address = profile.address;
    const [draft, setDraft] = useState<{ street: string; postalCode: string } | null>(null);
    const { save, errors, message, locked, send, reset, cancel } = useEditor(props, () => setDraft(null));
    const street = draft?.street ?? address?.street ?? "";
    const postalCode = draft?.postalCode ?? address?.postalCode ?? "";

    return (
        <Editable id="address" editLabel="Edit address" open={open} unsaved={draft !== null && (street !== (address?.street ?? "") || postalCode !== (address?.postalCode ?? ""))} saving={save.isPending} message={message}
            onOpen={() => { reset(); onOpen(); }} onClose={cancel}
            onSubmit={() => {
                const next = { street: street.trim(), postalCode: normalizePostalCode(postalCode) };
                const changed = next.street !== address?.street || next.postalCode !== address?.postalCode;
                send(validateAddress(street, postalCode), changed ? { address: next } : {});
            }}
            read={address && <>
                <p className="break-words">{address.street}<br />{address.city}, <span className={mono}>{formatPostalCode(address.postalCode)}</span></p>
                {locked && <p className="mt-1 text-[13px] text-text-muted">Locked while you have an Open or Assigned request.</p>}
            </>}
            fields={<AddressFields street={street} postalCode={postalCode} errors={errors} onStreet={(next) => setDraft({ street: next, postalCode })} onPostalCode={(next) => setDraft({ street, postalCode: next })} />} />
    );
}

export function CodesEditor(props: EditorProps) {
    const { profile, open, onOpen } = props;
    const [draft, setDraft] = useState<string[] | null>(null);
    const { save, errors, message, send, reset, cancel } = useEditor(props, () => setDraft(null));
    const codes = draft ?? profile.preferredPostalCodes;

    return (
        <Editable id="codes" editLabel="Edit preferred postal codes" open={open} unsaved={draft !== null && codes.join() !== profile.preferredPostalCodes.join()} saving={save.isPending} message={message}
            onOpen={() => { reset(); onOpen(); }} onClose={cancel}
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
                <PostalCodeList codes={codes} errors={errors} onChange={setDraft} />
            </div>} />
    );
}

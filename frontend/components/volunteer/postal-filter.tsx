"use client";

import { useState, type FormEvent } from "react";
import { Button, Field, input, mono } from "@/components/ui";
import { formatPostalCode } from "@/lib/postal-code";
import { normalizePostalCode, validateCodes } from "@/lib/validate-account";

export default function PostalFilter({ codes, onChange, showAll = true }: { codes: string[]; onChange: (codes: string[]) => void; showAll?: boolean }) {
    const [text, setText] = useState("");
    const [error, setError] = useState("");

    function add(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const code = normalizePostalCode(text);
        // validateCodes checks the format and duplicates, the new code is the last one in the list
        const problem = codes.length >= 10 ? "You can filter by up to 10 codes."
            : !code ? "Enter a Calgary postal code, for example T2P 1J9."
            : validateCodes([...codes, code])[`preferredPostalCodes[${codes.length}]`];
        setError(problem ?? "");
        if (problem) return;
        onChange([...codes, code]);
        setText("");
    }

    return (
        <form role="search" aria-label="Filter by postal code" onSubmit={add} noValidate className="min-w-0 space-y-2 rounded-xl border border-border bg-surface-elevated p-3 shadow-rest">
            {codes.length > 0 ? <><p className="font-semibold">Showing requests in:</p><ul className="flex flex-wrap gap-2">
                {codes.map(code => <li key={code}>
                    <button type="button" onClick={() => onChange(codes.filter(other => other !== code))} aria-label={`Remove ${formatPostalCode(code)}`}
                        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-neutral-600 bg-neutral-100 px-4 font-semibold hover:bg-text/10">
                        <span className={mono}>{formatPostalCode(code)}</span> <span aria-hidden="true">×</span>
                    </button>
                </li>)}
            </ul></> : <p className="text-neutral-700">Showing all postal codes.</p>}
            <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1 basis-48">
                    <Field label="Add a postal code" error={error || undefined}>
                        {control => <input {...control} type="text" autoComplete="off" value={text} className={input}
                            onChange={event => setText(event.target.value)} />}
                    </Field>
                </div>
                <Button type="submit" variant="secondary">Add</Button>
                {showAll && codes.length > 0 && <Button variant="secondary" onClick={() => { setError(""); onChange([]); }}>Show all areas</Button>}
            </div>
        </form>
    );
}

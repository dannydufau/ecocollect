"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import RequestForm, { type RequestValues } from "./request-form";
import TermsCheckbox from "@/components/terms-checkbox";
import { Alert } from "@/components/ui/alert";
import { apiFetch, ApiError, friendlyError } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useTerms } from "@/lib/use-terms";
import type { CreateRequests, CreatedRequest } from "@/lib/types";

export default function NewRequestForm() {
    const router = useRouter();
    const client = useQueryClient();
    const terms = useTerms();
    const [termsDocumentId, setTermsDocumentId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [fields, setFields] = useState<Record<string, string>>({});
    // A retry of the same body reuses its key. A changed body gets a new one so an edit is not lost
    const sent = useRef<{ json: string; key: string } | null>(null);
    const inFlight = useRef(false);
    const completed = useRef(false);
    const accepted = !terms.isPending && !terms.isError && termsDocumentId !== null && termsDocumentId === terms.data?.termsDocumentId;

    async function submit(values: RequestValues) {
        if (!accepted || !termsDocumentId || inFlight.current || completed.current) return;
        inFlight.current = true;
        setBusy(true);
        setMessage(null);
        setFields({});
        try {
            const body: CreateRequests = {
                items: values.items.map(item => ({ categoryId: item.categoryId, quantity: Number(item.quantity) })),
                windows: values.windows.map(({ date, startHour }) => ({ date, startHour })),
                ...(values.notes ? { notes: values.notes } : {}),
                termsDocumentId,
            };
            const json = JSON.stringify(body);
            if (sent.current?.json !== json) sent.current = { json, key: crypto.randomUUID() };
            const response = await apiFetch<{ requests: CreatedRequest[] }>("/api/requests", {
                method: "POST", headers: { "Idempotency-Key": sent.current.key }, body: json,
            });
            completed.current = true;
            await client.invalidateQueries({ queryKey: queryKeys.myRequests });
            router.push(`/resident?created=${response.requests.length}`);
        } catch (error) {
            setMessage(friendlyError(error));
            if (error instanceof ApiError && error.status === 400) setFields(error.fields);
            if (error instanceof ApiError && error.status === 409 && error.code === "terms_outdated") {
                setTermsDocumentId(null);
                await client.invalidateQueries({ queryKey: queryKeys.terms });
            }
        } finally {
            inFlight.current = false;
            if (!completed.current) setBusy(false);
        }
    }

    function clearErrors() {
        setFields({});
        setMessage(null);
    }

    return <RequestForm onValid={submit} fieldErrors={fields} busy={busy} submitDisabled={!accepted} submitLabel="Send request" onEdit={clearErrors}>
        <TermsCheckbox value={termsDocumentId} onChange={setTermsDocumentId} />
        {message && <Alert variant="error">{message}</Alert>}
    </RequestForm>;
}

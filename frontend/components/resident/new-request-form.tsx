"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import RequestForm, { validate, type RequestValues } from "./request-form";
import ReviewRequest from "./review-request";
import TermsCheckbox from "@/components/terms-checkbox";
import { Alert, pageTitle } from "@/components/ui";
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
    const [review, setReview] = useState<RequestValues | null>(null);
    const editor = useRef<HTMLDivElement>(null);
    const wasReviewing = useRef(false);
    useEffect(() => {
        if (wasReviewing.current && !review && !Object.keys(fields).length) {
            editor.current?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus();
        }
        wasReviewing.current = review !== null;
    }, [review, fields]);
    // A retry of the same body reuses its key. A changed body gets a new one so an edit is not lost
    const sent = useRef<{ json: string; key: string } | null>(null);
    const inFlight = useRef(false);
    const completed = useRef(false);
    const accepted = !terms.isPending && !terms.isError && termsDocumentId !== null && termsDocumentId === terms.data?.termsDocumentId;

    async function submit(values: RequestValues) {
        if (!accepted || !termsDocumentId || inFlight.current || completed.current) return;
        const errors = validate(values);
        if (Object.keys(errors).length) {
            setFields(errors);
            setReview(null);
            return;
        }
        inFlight.current = true;
        setBusy(true);
        setMessage(null);
        setFields({});
        try {
            const body: CreateRequests = {
                items: values.items.map(item => ({ categoryId: item.categoryId, quantity: Number(item.quantity), ...(item.photo ? { photo: item.photo } : {}) })),
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
            if (error instanceof ApiError && error.status === 400) {
                setFields(error.fields);
                setReview(null);
            }
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

    return <>
        <p aria-current="step" className="text-sm font-semibold text-text-muted">Step {review ? 2 : 1} of 2</p>
        {!review && <>
            <h1 className={pageTitle}>New pickup request</h1>
            <p>Add the items you want collected. Each item becomes its own request.</p>
        </>}
        <div ref={editor} hidden={review !== null}>
            <RequestForm onValid={values => { clearErrors(); setTermsDocumentId(null); setReview(values); }} fieldErrors={fields} busy={busy} submitLabel="Review" onEdit={clearErrors}>
                {message && !review && <Alert variant="error">{message}</Alert>}
            </RequestForm>
        </div>
        {review && <ReviewRequest values={review} busy={busy} accepted={accepted} onBack={() => { clearErrors(); setReview(null); }} onConfirm={() => void submit(review)}>
            <TermsCheckbox value={termsDocumentId} onChange={setTermsDocumentId} />
            {message && <Alert variant="error">{message}</Alert>}
        </ReviewRequest>}
    </>;
}

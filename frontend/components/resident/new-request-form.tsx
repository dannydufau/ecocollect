"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import RequestForm, { shownInForm, validate, type RequestValues } from "./request-form";
import ReviewRequest from "./review-request";
import TermsCheckbox from "@/components/terms-checkbox";
import { Alert, pageTitle } from "@/components/ui";
import { apiFetch, ApiError, fieldErrorsMessage, friendlyError, hasFieldErrors } from "@/lib/api";
import { auth } from "@/lib/firebase";
import { queryKeys } from "@/lib/query-keys";
import { useTerms } from "@/lib/use-terms";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";
import type { CreateRequests, CreatedRequest } from "@/lib/types";

const DRAFT_PREFIX = "ecocollect:draft:new-request:";
const draftKey = () => `${DRAFT_PREFIX}${auth.currentUser?.uid ?? "guest"}`;

function loadDraft(): RequestValues | undefined {
    try {
        const raw = sessionStorage.getItem(draftKey());
        if (!raw) return undefined;
        const parsed = JSON.parse(raw) as Partial<RequestValues>;
        if (!Array.isArray(parsed.items) || !parsed.items.length || !Array.isArray(parsed.windows)) return undefined;
        return { items: parsed.items, windows: parsed.windows, notes: typeof parsed.notes === "string" ? parsed.notes : "" };
    } catch {
        return undefined;
    }
}

function saveDraft(values: RequestValues) {
    try {
        const stripped: RequestValues = {
            items: values.items.map(({ categoryId, quantity, photo }) => ({ categoryId, quantity, ...(photo !== undefined ? { photo } : {}) })),
            windows: values.windows,
            notes: values.notes,
        };
        sessionStorage.setItem(draftKey(), JSON.stringify(stripped));
    } catch {}
}

function clearDraft() {
    try {
        sessionStorage.removeItem(draftKey());
    } catch {}
}

function isDirtyDraft(values: RequestValues): boolean {
    return values.items.length > 1
        || values.items.some(item => Boolean(item.categoryId || item.quantity !== "1" || item.photo))
        || values.windows.length > 0
        || Boolean(values.notes.trim());
}

export default function NewRequestForm() {
    const router = useRouter();
    const client = useQueryClient();
    const terms = useTerms();
    const [initialDraft] = useState<RequestValues | undefined>(() => loadDraft());
    const [dirty, setDirty] = useState(() => Boolean(initialDraft && isDirtyDraft(initialDraft)));
    const [termsDocumentId, setTermsDocumentId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [fields, setFields] = useState<Record<string, string>>({});
    const [review, setReview] = useState<RequestValues | null>(null);
    const lastReview = useRef<RequestValues | null>(null);
    const editor = useRef<HTMLDivElement>(null);
    const wasReviewing = useRef(false);
    useEffect(() => {
        if (wasReviewing.current && !review && !Object.keys(fields).length) {
            editor.current?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus();
        }
        wasReviewing.current = review !== null;
    }, [review, fields]);
    // Keep review in browser history so Back returns to the filled form instead of leaving the page.
    useEffect(() => {
        // Clear a stale #review hash (e.g. direct visit or reload) so entering review pushes a clean Back step.
        if (window.location.hash === "#review") {
            window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
        }
        const onPopState = () => {
            if (window.location.hash === "#review" && lastReview.current) {
                setReview(lastReview.current);
            } else {
                setReview(null);
            }
        };
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, []);
    // A retry of the same body reuses its key. A changed body gets a new one so an edit is not lost
    const sent = useRef<{ json: string; key: string } | null>(null);
    const inFlight = useRef(false);
    const completed = useRef(false);
    useUnsavedWarning(dirty && !completed.current);
    const accepted = !terms.isPending && !terms.isError && termsDocumentId !== null && termsDocumentId === terms.data?.termsDocumentId;

    function enterReview(values: RequestValues) {
        clearErrors();
        setTermsDocumentId(null);
        lastReview.current = values;
        setReview(values);
        if (window.location.hash !== "#review") {
            window.history.pushState({ ...window.history.state, ecocollectReview: true }, "", "#review");
        }
    }

    function leaveReview() {
        clearErrors();
        setReview(null);
        if (window.location.hash === "#review") window.history.back();
    }

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
            setDirty(false);
            clearDraft();
            await client.invalidateQueries({ queryKey: queryKeys.myRequests });
            router.push(`/resident?created=${response.requests.length}`);
        } catch (error) {
            // The form shows its own fields' errors next to their inputs; the alert says the rest
            setMessage(hasFieldErrors(error) ? fieldErrorsMessage(error, shownInForm) : friendlyError(error));
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
            <RequestForm initialValues={initialDraft} onValid={enterReview} fieldErrors={fields} busy={busy} submitLabel="Review"
                onEdit={() => { clearErrors(); lastReview.current = null; }}
                onValuesChange={next => {
                    const hasContent = isDirtyDraft(next);
                    setDirty(hasContent);
                    if (hasContent) saveDraft(next);
                    else clearDraft();
                }}>
                {message && !review && <Alert variant="error">{message}</Alert>}
            </RequestForm>
        </div>
        {review && <div className="fade-in">
            <ReviewRequest values={review} busy={busy} accepted={accepted} onBack={leaveReview} onConfirm={() => void submit(review)}>
                <TermsCheckbox value={termsDocumentId} onChange={setTermsDocumentId} />
                {message && <Alert variant="error">{message}</Alert>}
            </ReviewRequest>
        </div>}
    </>;
}

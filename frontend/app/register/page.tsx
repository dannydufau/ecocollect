"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { redirect, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import RegisterForm from "@/components/register-form";
import TermsCheckbox from "@/components/terms-checkbox";
import { Alert, card, pageTitle, pageWidth, textLink } from "@/components/ui";
import { ApiError, api, friendlyError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { isDemo } from "@/lib/demo";
import { queryKeys } from "@/lib/query-keys";
import { normalizePostalCode, normalizeUsername, type AccountValues } from "@/lib/validate-account";

const formFields = /^(firstName|lastName|publicName|dateOfBirth|username|email|password|role|address\.street|address\.postalCode|preferredPostalCodes(\[\d+\])?)$/;

export default function RegisterPage() {
    if (isDemo) redirect("/demo");
    const router = useRouter();
    const queryClient = useQueryClient();
    const { user, roles, loading, signIn } = useAuth();
    const [termsDocumentId, setTermsDocumentId] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [created, setCreated] = useState(false);
    const [busy, setBusy] = useState(false);

    // A signed-in user has nothing to do here. Not while creating, the sign in after the create must not race this.
    useEffect(() => {
        if (!loading && user && roles.length > 0 && !busy && !created) router.replace("/choose-role");
    }, [loading, user, roles, busy, created, router]);

    async function create(values: AccountValues) {
        setBusy(true);
        setError(null);
        const email = values.email.trim();
        // README U4, only the fields of the chosen role
        const body = {
            username: normalizeUsername(values.username), email, password: values.password,
            firstName: values.firstName.trim(), lastName: values.lastName.trim(), publicName: values.publicName.trim(),
            dateOfBirth: values.dateOfBirth, role: values.role, termsDocumentId,
            ...(values.role === "resident"
                ? { address: { street: values.street.trim(), postalCode: normalizePostalCode(values.postalCode) } }
                : { preferredPostalCodes: values.preferredPostalCodes.map(normalizePostalCode).filter(Boolean) }),
        };
        try {
            await api.post("/api/accounts", body);
        } catch (err) {
            const code = err instanceof ApiError ? err.code : "";
            if (code === "username_taken") setFieldErrors({ username: friendlyError(err) });
            else if (code === "email_taken") setFieldErrors({ email: friendlyError(err) });
            else if (err instanceof ApiError && err.status === 400 && Object.keys(err.fields).length) {
                setFieldErrors(err.fields);
                // A key the form has no input for would show nothing, so say it in the alert too
                if (!Object.keys(err.fields).every(key => formFields.test(key))) setError(friendlyError(err));
            }
            else {
                // The new terms come back with another id, so the checkbox clears itself
                if (code === "terms_outdated") void queryClient.invalidateQueries({ queryKey: queryKeys.terms });
                setError(friendlyError(err));
            }
            setBusy(false);
            return;
        }
        try {
            await signIn(email, values.password);
            router.replace("/choose-role");
        } catch {
            setCreated(true);
            setBusy(false);
        }
    }

    return <main className={`${pageWidth} p-4 sm:p-8`}>
        <div className="max-w-xl space-y-6">
            <Image src="/ecocollect-mark.png" alt="" width={61} height={64} priority />
            <div>
                <h1 className={pageTitle}>Create your account</h1>
                <Link href="/login" className={textLink}>Already have an account? Sign in</Link>
            </div>
            <RegisterForm onValid={create} fieldErrors={fieldErrors} busy={busy} submitDisabled={!termsDocumentId || created}
                submitHint={!termsDocumentId && !created ? "Accept the terms above to continue." : undefined}
                onEdit={() => setFieldErrors({})}>
                <section aria-labelledby="terms-heading" className={`${card} min-w-0 space-y-3`}>
                    <h2 id="terms-heading">Terms</h2>
                    <TermsCheckbox value={termsDocumentId} onChange={setTermsDocumentId} />
                </section>
                {error && <Alert variant="error">{error}</Alert>}
                {created && <Alert variant="warning">
                    Your account was created, but we could not sign you in. Please sign in. <Link href="/login" className={textLink}>Go to sign in</Link>
                </Alert>}
            </RegisterForm>
        </div>
    </main>;
}

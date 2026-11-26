"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FirebaseError } from "firebase/app";
import { sendPasswordResetEmail } from "firebase/auth";
import { Alert, Button, Field, card, input, pageTitle, textLink } from "@/components/ui";
import { isDemo } from "@/lib/demo";
import { auth } from "@/lib/firebase";

// A badly formed email says nothing about who has an account, so it is the one error that names the problem
function errorMessage(err: unknown): string {
    if (err instanceof FirebaseError) {
        switch (err.code) {
            case "auth/invalid-email":
                return "Enter a valid email.";
            case "auth/too-many-requests":
                return "Too many attempts. Wait a moment and try again.";
            case "auth/network-request-failed":
                return "Network error. Check your connection.";
        }
    }
    return "Something went wrong. Please try again.";
}

export default function ForgotPasswordPage() {
    if (isDemo) redirect("/demo");
    const [email, setEmail] = useState("");
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sending, setSending] = useState(false);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (sending) return;
        setSent(false);
        setError(null);
        setSending(true);
        try {
            await sendPasswordResetEmail(auth, email.trim());
            setSent(true);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setSending(false);
        }
    }

    return (
        <main className="flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-4 p-4 sm:p-8">
            <form onSubmit={handleSubmit} className={`${card} flex w-full max-w-[440px] min-w-0 flex-col gap-4`}>
                <h1 className={pageTitle}>Reset your password</h1>
                <p className="text-text-muted">Enter your email and we will send you a link to choose a new password.</p>
                <Field label="Email">
                    {control => (
                        <input {...control} type="email" value={email} onChange={e => setEmail(e.target.value)}
                            required autoComplete="email" className={input} />
                    )}
                </Field>
                {/* The same words whether or not an account uses the email, so the page does not give it away (NFR03) */}
                {sent && <Alert variant="success">If an account uses that email, we have sent a reset link. It can take a few minutes.</Alert>}
                {error && <Alert variant="error">{error}</Alert>}
                <Button type="submit" busy={sending} busyLabel="Sending..." className="w-full">Send reset link</Button>
                <Link href="/login" className={`${textLink} self-start`}>Back to sign in</Link>
            </form>
        </main>
    );
}

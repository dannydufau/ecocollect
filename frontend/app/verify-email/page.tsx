"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FirebaseError } from "firebase/app";
import LogoutButton from "@/components/logout-button";
import { Alert, Button, PageLoading, QueryError, card, pageTitle, textLink } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";

const COOLDOWN_SECONDS = 60;

function resendErrorMessage(err: unknown): string {
    if (err instanceof FirebaseError) {
        if (err.code === "auth/too-many-requests") {
            return "Too many verification emails sent. Wait a moment before trying again.";
        }
        if (err.code === "auth/network-request-failed") {
            return "Network error. Check your connection and try again.";
        }
    }
    return "We could not send the verification email. Please try again.";
}

function VerifyEmailContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const {
        user,
        loading,
        verificationState,
        retryRoles,
        sendVerificationEmail,
        recheckVerification,
    } = useAuth();

    const initialSent = searchParams.get("sent") === "1";
    const initialSendError = searchParams.get("sendError") === "1";

    const [cooldown, setCooldown] = useState(initialSent && !initialSendError ? COOLDOWN_SECONDS : 0);
    const [sending, setSending] = useState(false);
    const [checking, setChecking] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(
        initialSent && !initialSendError
            ? "We sent a verification link to your email address. Check your inbox and spam folder."
            : null,
    );
    const [errorMessage, setErrorMessage] = useState<string | null>(
        initialSendError
            ? "We could not send the verification email yet. Select Send again to try once more."
            : null,
    );

    useEffect(() => {
        if (loading) return;
        if (!user) {
            router.replace("/login");
            return;
        }
        if (verificationState === "verified") {
            router.replace("/choose-role");
        }
    }, [loading, user, verificationState, router]);

    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = setInterval(() => {
            setCooldown((prev) => (prev > 1 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(timer);
    }, [cooldown]);

    async function handleResend() {
        if (sending || cooldown > 0) return;
        setSending(true);
        setErrorMessage(null);
        setStatusMessage(null);
        try {
            await sendVerificationEmail();
            setCooldown(COOLDOWN_SECONDS);
            setStatusMessage("Verification email sent. Check your inbox and spam folder.");
        } catch (err) {
            setErrorMessage(resendErrorMessage(err));
        } finally {
            setSending(false);
        }
    }

    async function handleRecheck() {
        if (checking) return;
        setChecking(true);
        setErrorMessage(null);
        setStatusMessage(null);
        try {
            const result = await recheckVerification();
            if (result === "verified") {
                router.replace("/choose-role");
                return;
            }
            setStatusMessage("Your email is still not verified. Open the link in your email, then select I’ve verified.");
        } catch {
            setErrorMessage("We could not check your verification status. Check your connection and try again.");
        } finally {
            setChecking(false);
        }
    }

    if (loading || !user || verificationState === "checking" || verificationState === "verified") {
        return <PageLoading />;
    }

    if (verificationState === "check-failed") {
        return (
            <main className="flex w-full min-w-0 flex-1 flex-col items-center justify-center p-4 sm:p-8">
                <section className={`${card} flex w-full max-w-[460px] min-w-0 flex-col gap-4`}>
                    <h1 className={pageTitle}>Verify your email</h1>
                    <QueryError
                        message="We could not verify your account status. Check your connection and try again."
                        onRetry={() => void retryRoles()}
                    />
                    <div className="flex items-center justify-between gap-3 pt-2">
                        <Link href="/stats" className={textLink}>Community stats</Link>
                        <LogoutButton />
                    </div>
                </section>
            </main>
        );
    }

    return (
        <main className="flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-4 p-4 sm:p-8">
            <section aria-labelledby="verify-email-title" className={`${card} flex w-full max-w-[460px] min-w-0 flex-col gap-4`}>
                <Image src="/ecocollect-mark.png" alt="" width={48} height={50} priority />
                <h1 id="verify-email-title" className={pageTitle}>Verify your email</h1>
                <p className="text-text-muted">
                    Verify your email address before using protected EcoCollect features.
                    {user.email ? (
                        <>
                            {" "}Account email: <strong className="break-all font-semibold text-text">{user.email}</strong>.
                        </>
                    ) : null}
                </p>
                <p className="text-small text-text-muted">
                    Open the verification link from Firebase in your inbox (or spam/junk folder). You can open the link on another device, then return here and select <strong>I’ve verified</strong>.
                </p>

                {statusMessage && <Alert variant="info">{statusMessage}</Alert>}
                {errorMessage && <Alert variant="error">{errorMessage}</Alert>}

                <div className="flex flex-col gap-2.5 pt-1">
                    <Button type="button" onClick={() => void handleRecheck()} busy={checking} busyLabel="Checking..." className="w-full">
                        I’ve verified
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void handleResend()}
                        busy={sending}
                        busyLabel="Sending..."
                        disabled={cooldown > 0}
                        className="w-full"
                    >
                        {cooldown > 0 ? `Send again (${cooldown}s)` : "Send again"}
                    </Button>
                </div>

                <hr className="border-divider" />
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link href="/stats" className={`${textLink} text-small`}>Community stats</Link>
                    <LogoutButton />
                </div>
            </section>
        </main>
    );
}

export default function VerifyEmailPage() {
    return (
        <Suspense fallback={<PageLoading />}>
            <VerifyEmailContent />
        </Suspense>
    );
}

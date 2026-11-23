"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { redirect, useRouter, useSearchParams } from "next/navigation";
import { FirebaseError } from "firebase/app";
import { useAuth } from "@/lib/auth-context";
import { isDemo } from "@/lib/demo";
import { Alert, Button, Field, PasswordInput, card, input, pageTitle, textLink } from "@/components/ui";

function errorMessage(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case "auth/invalid-credential":
      case "auth/invalid-email":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "Incorrect email or password.";
      case "auth/too-many-requests":
        return "Too many attempts. Wait a moment and try again.";
      case "auth/network-request-failed":
        return "Network error. Check your connection.";
      case "auth/user-disabled":
        return "This account has been deactivated.";
    }
  }
  return "Something went wrong. Please try again.";
}

// Reading the search params needs its own Suspense boundary or the build fails
function ExpiredNotice() {
  const expired = useSearchParams().get("expired") === "1";
  return expired ? <Alert variant="info">Please sign in again.</Alert> : null;
}

export default function LoginPage() {
  if (isDemo) redirect("/demo");
  const router = useRouter();
  const { user, roles, loading, signIn, signOut } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !submitting && user && roles.length > 0) {
      router.replace("/choose-role");
    }
  }, [loading, submitting, user, roles, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const userRoles = await signIn(email, password);
      if (userRoles.length === 0) {
        await signOut();
        setError("This account has no role assigned.");
        return;
      }
      router.replace("/choose-role");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-4 p-4 sm:p-8">
      <form onSubmit={handleSubmit} className={`${card} flex w-full max-w-[440px] min-w-0 flex-col gap-4 p-6 shadow-hover`}>
        <h1 className={pageTitle}>Sign in to EcoCollect</h1>
        <p className="text-text-muted">Calgary’s community e-waste courier.</p>
        <Suspense fallback={null}>
          <ExpiredNotice />
        </Suspense>
        <Field label="Email">
          {(control) => (
            <input {...control} type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              required autoComplete="email" className={input} />
          )}
        </Field>
        <Field label="Password">
          {(control) => (
            <PasswordInput {...control} value={password} onChange={(e) => setPassword(e.target.value)}
              required autoComplete="current-password" />
          )}
        </Field>
        {error && <Alert variant="error">{error}</Alert>}
        <Button type="submit" busy={submitting} busyLabel="Signing in..." className="w-full">Sign in</Button>
        <Link href="/register" className={`${textLink} self-start`}>Create an account</Link>
      </form>
      <Link href="/stats" className={`${textLink} text-sm`}>Community stats</Link>
    </main>
  );
}

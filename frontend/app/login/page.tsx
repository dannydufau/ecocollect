"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { redirect, useRouter, useSearchParams } from "next/navigation";
import { FirebaseError } from "firebase/app";
import { useAuth } from "@/lib/auth-context";
import { isDemo } from "@/lib/demo";
import { Alert, Button, EyeIcon, EyeOffIcon, Field, card, input, textLink } from "@/components/ui";

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
  const [showPassword, setShowPassword] = useState(false);
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
      <form onSubmit={handleSubmit} className={`${card} flex w-full max-w-[440px] min-w-0 flex-col gap-4 p-6 shadow-[0_3px_10px_rgba(46,43,37,0.16)]`}>
        <h1 className="text-[32px]">Sign in to EcoCollect</h1>
        <p className="text-neutral-800">Calgary’s community e-waste courier.</p>
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
            <div className="relative">
              <input {...control} type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                required autoComplete="current-password" className={`${input} pr-12`} />
              <button type="button" aria-pressed={showPassword} aria-label="Show password" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-0 top-0 inline-flex size-11 items-center justify-center rounded-full text-neutral-800 hover:bg-text/10">
                {showPassword ? <EyeOffIcon className="size-5" /> : <EyeIcon className="size-5" />}
              </button>
            </div>
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

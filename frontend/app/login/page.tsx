"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FirebaseError } from "firebase/app";
import { useAuth } from "@/lib/auth-context";
import { Alert, Button, Field, card, input } from "@/components/ui";

function errorMessage(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case "auth/invalid-credential":
      case "auth/invalid-email":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "Email or password is wrong";
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
    <main className="mx-auto w-full max-w-sm min-w-0 p-4 sm:p-8">
      <form onSubmit={handleSubmit} className={`${card} flex flex-col gap-4 p-6 shadow-[0_3px_10px_rgba(46,43,37,0.16)]`}>
        <Image src="/ecocollect-mark.png" alt="" width={69} height={72} priority className="self-start" />
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
            <input {...control} type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              required autoComplete="current-password" className={input} />
          )}
        </Field>
        {error && <Alert variant="error">{error}</Alert>}
        <Button type="submit" busy={submitting} busyLabel="Signing in..." className="w-full">Sign in</Button>
        <div className="flex flex-wrap gap-4">
          <Link href="/register" className="inline-flex min-h-11 items-center text-accent-700 underline underline-offset-4">Create an account</Link>
          <Link href="/stats" className="inline-flex min-h-11 items-center text-accent-700 underline underline-offset-4">Community stats</Link>
        </div>
      </form>
    </main>
  );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { auth } from "@/lib/firebase";
import { getRoles, homeFor } from "@/lib/auth";
import { useAuth } from "@/lib/auth-context";

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
    }
  }
  return "Something went wrong. Please try again.";
}

export default function LoginPage() {
  const router = useRouter();
  const { user, roles, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !submitting && user && roles.length > 0) {
      router.replace(homeFor(roles));
    }
  }, [loading, submitting, user, roles, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );
      const userRoles = await getRoles(credential.user);
      if (userRoles.length === 0) {
        await signOut(auth);
        setError("This account has no role assigned.");
        return;
      }
      router.replace(homeFor(userRoles));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">EcoCollect login</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="rounded border px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="rounded border px-3 py-2"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50"
        >
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}

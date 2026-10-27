"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { homeFor } from "@/lib/auth";

export default function Home() {
  const { user, roles, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      router.replace(user ? homeFor(roles) : "/login");
    }
  }, [loading, user, roles, router]);

  return <p className="p-8">Loading...</p>;
}
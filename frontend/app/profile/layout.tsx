import type { Metadata } from "next";
import type { ReactNode } from "react";
import RequireAuth from "@/components/require-auth";

export const metadata: Metadata = { title: "Profile" };

export default function ProfileLayout({ children }: { children: ReactNode }) {
    return <RequireAuth>{children}</RequireAuth>;
}

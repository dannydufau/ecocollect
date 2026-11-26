import type { Metadata } from "next";
import type { ReactNode } from "react";
import RequireAuth from "@/components/require-auth";

export const metadata: Metadata = { title: "EcoPoints" };

export default function EcoPointsLayout({ children }: { children: ReactNode }) {
    return <RequireAuth>{children}</RequireAuth>;
}

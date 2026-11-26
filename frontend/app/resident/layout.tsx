import type { Metadata } from "next";
import type { ReactNode } from "react";
import RequireRole from "@/components/require-role";

export const metadata: Metadata = { title: { default: "My requests", template: "%s · EcoCollect" } };

export default function ResidentLayout({ children }: { children: ReactNode }) {
    return <RequireRole role="resident">{children}</RequireRole>;
}
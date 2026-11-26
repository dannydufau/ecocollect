import type { Metadata } from "next";
import type { ReactNode } from "react";
import RequireRole from "@/components/require-role";

export const metadata: Metadata = { title: { default: "Available requests", template: "%s · EcoCollect" } };

export default function VolunteerLayout({ children }: { children: ReactNode }) {
    return <RequireRole role="volunteer">{children}</RequireRole>;
}
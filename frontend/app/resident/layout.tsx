import type { ReactNode } from "react";
import RequireRole from "@/components/require-role";

export default function ResidentLayout({ children }: { children: ReactNode }) {
    return <RequireRole role="resident">{children}</RequireRole>;
}
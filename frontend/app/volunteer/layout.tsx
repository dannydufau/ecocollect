import type { ReactNode } from "react";
import RequireRole from "@/components/require-role";

export default function VolunteerLayout({ children }: { children: ReactNode }) {
    return <RequireRole role="volunteer">{children}</RequireRole>;
}
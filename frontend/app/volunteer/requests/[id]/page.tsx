"use client";

import { useParams } from "next/navigation";
import VolunteerRequestDetail from "@/components/volunteer/request-detail";
import { pageWidth } from "@/components/ui";

export default function VolunteerRequestPage() {
    const { id } = useParams<{ id: string }>();
    return (
        <main className={`${pageWidth} p-4 sm:p-8`}>
            <div className="space-y-6">
                <VolunteerRequestDetail requestId={id} />
            </div>
        </main>
    );
}

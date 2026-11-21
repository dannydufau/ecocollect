"use client";

import { useParams } from "next/navigation";
import VolunteerRequestDetail from "@/components/volunteer/request-detail";

export default function VolunteerRequestPage() {
    const { id } = useParams<{ id: string }>();
    return (
        <main className="p-4 sm:p-8">
            <div className="mx-auto max-w-5xl space-y-6">
                <VolunteerRequestDetail requestId={id} />
            </div>
        </main>
    );
}

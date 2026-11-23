import ResidentRequestDetail from "@/components/resident/request-detail";
import { pageWidth } from "@/components/ui";

export default async function ResidentRequestPage({ params, searchParams }: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ rescheduled?: string | string[] }>;
}) {
    const { id } = await params;
    const { rescheduled } = await searchParams;
    return <main className={`${pageWidth} space-y-6 p-4 sm:p-8`}>
        <ResidentRequestDetail requestId={id} rescheduled={rescheduled === "1"} />
    </main>;
}

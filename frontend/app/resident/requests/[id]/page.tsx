import ResidentRequestDetail from "@/components/resident/request-detail";

export default async function ResidentRequestPage({ params, searchParams }: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ rescheduled?: string | string[] }>;
}) {
    const { id } = await params;
    const { rescheduled } = await searchParams;
    return <main className="mx-auto w-full max-w-4xl min-w-0 space-y-6 p-4 sm:p-8">
        <ResidentRequestDetail requestId={id} rescheduled={rescheduled === "1"} />
    </main>;
}

import LogoutButton from "@/components/logout-button";
import MyRequests from "@/components/resident/my-requests";

export default async function ResidentPage({ searchParams }: {
    searchParams: Promise<{ created?: string | string[] }>;
}) {
    const { created } = await searchParams;
    return (
        <main className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-6 p-4 sm:p-8">
            <div className="flex justify-end"><LogoutButton /></div>
            <MyRequests created={typeof created === "string" ? created : undefined} />
        </main>
    );
}

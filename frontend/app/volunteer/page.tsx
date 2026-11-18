import AvailableRequests from "@/components/volunteer/available-requests";

export default function VolunteerPage() {
    return (
        <main className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-6 p-4 sm:p-8">
            <AvailableRequests />
        </main>
    );
}

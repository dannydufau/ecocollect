import AvailableRequests from "@/components/volunteer/available-requests";
import LogoutButton from "@/components/logout-button";

export default function VolunteerPage() {
    return (
        <main className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-6 p-4 sm:p-8">
            <div className="flex justify-end"><LogoutButton /></div>
            <AvailableRequests />
        </main>
    );
}

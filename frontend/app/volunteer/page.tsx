import LogoutButton from "@/components/logout-button";

export default function VolunteerPage() {
    return (
        <main className="flex flex-col gap-4 p-8">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold">Volunteer view</h1>
                <LogoutButton />
            </div>
            <p>Signed in as a volunteer.</p>
        </main>
    );
}
import LogoutButton from "@/components/logout-button";
import MyRequests from "@/components/my-requests";

export default function ResidentPage() {
    return (
        <main className="flex flex-col gap-6 p-8">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold">Resident view</h1>
                <LogoutButton />
            </div>
            <MyRequests />
        </main>
    );
}

import Link from "next/link";
import LogoutButton from "@/components/logout-button";
import MyRequests from "@/components/my-requests";

export default function ResidentPage() {
    return (
        <main className="flex flex-col gap-8 p-8">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold">Resident view</h1>
                <LogoutButton />
            </div>
            <Link href="/resident/requests/new" className="inline-flex min-h-11 items-center self-start rounded-lg bg-[#9e5220] px-4 text-white focus-visible:outline-2 focus-visible:outline-offset-2">New pickup request</Link>
            <MyRequests />
        </main>
    );
}

import { Suspense } from "react";
import MyRequests from "@/components/resident/my-requests";

export default function ResidentPage() {
    return (
        <main className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-6 p-4 sm:p-8">
            <Suspense>
                <MyRequests />
            </Suspense>
        </main>
    );
}

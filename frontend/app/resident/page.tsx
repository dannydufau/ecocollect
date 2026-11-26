import { Suspense } from "react";
import MyRequests from "@/components/resident/my-requests";
import { pageWidth } from "@/components/ui";

export default function ResidentPage() {
    return (
        <main className={`${pageWidth} flex flex-col gap-6 p-4 sm:p-8`}>
            <Suspense>
                <MyRequests />
            </Suspense>
        </main>
    );
}

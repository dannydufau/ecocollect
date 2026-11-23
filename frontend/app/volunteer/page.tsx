import AvailableRequests from "@/components/volunteer/available-requests";
import { pageWidth } from "@/components/ui";

export default function VolunteerPage() {
    return (
        <main className={`${pageWidth} flex flex-col gap-6 p-4 sm:p-8`}>
            <AvailableRequests />
        </main>
    );
}

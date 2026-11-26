import NewRequestForm from "@/components/resident/new-request-form";
import { pageWidth } from "@/components/ui";

export default function NewRequestPage() {
    return <main className={`${pageWidth} space-y-6 p-4 sm:p-8`}>
        <NewRequestForm />
    </main>;
}

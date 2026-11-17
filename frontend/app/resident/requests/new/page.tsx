import RequireRole from "@/components/require-role";
import NewRequestForm from "@/components/resident/new-request-form";

export default function NewRequestPage() {
    return <RequireRole role="resident">
        <main className="mx-auto w-full max-w-4xl min-w-0 space-y-6 p-4 sm:p-8">
            <h1 className="text-[length:clamp(30px,5vw,40px)]">New pickup request</h1>
            <p>Add the items you want collected. Each item becomes its own request.</p>
            <NewRequestForm />
        </main>
    </RequireRole>;
}

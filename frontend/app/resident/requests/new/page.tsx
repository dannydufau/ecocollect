import RequireRole from "@/components/require-role";
import NewRequestForm from "@/components/resident/new-request-form";

export default function NewRequestPage() {
    return <RequireRole role="resident">
        <main className="min-h-screen space-y-6 bg-stone-50 p-4 text-stone-900 sm:p-8">
            <h1 className="text-3xl font-semibold">New pickup request</h1>
            <p>Add the items you want collected. Each item becomes its own request.</p>
            <NewRequestForm />
        </main>
    </RequireRole>;
}

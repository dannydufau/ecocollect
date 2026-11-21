import { isDemo } from "@/lib/demo";

export default function DemoBanner() {
    if (!isDemo) return null;
    return (
        <div role="note" className="bg-accent-200 text-accent-900">
            <p className="mx-auto max-w-5xl px-4 py-2 text-center text-[14px] sm:px-8">
                <strong>Demo.</strong> Everyone shares this demo data. It resets every night.
            </p>
        </div>
    );
}

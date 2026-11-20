import { isDemo } from "@/lib/demo";

export default function DemoBanner() {
    if (!isDemo) return null;
    return (
        <p className="bg-accent-200 px-4 py-2 text-center text-[14px] text-accent-900">
            <strong>Demo.</strong> Everyone shares this demo data. It resets every night.
        </p>
    );
}

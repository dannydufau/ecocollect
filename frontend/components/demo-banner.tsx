import { InfoIcon, pageWidth } from "@/components/ui";
import { isDemo } from "@/lib/demo";

export default function DemoBanner() {
    if (!isDemo) return null;
    return (
        <div role="note" className="bg-accent-100 text-accent-900">
            <p className={`${pageWidth} flex items-center justify-center gap-2 px-4 py-1.5 text-caption sm:px-8`}>
                <InfoIcon className="size-4 flex-none" />
                <span><strong>Demo.</strong> Everyone shares this demo data. It resets every night.</span>
            </p>
        </div>
    );
}

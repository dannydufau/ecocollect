import { LoadingRegion, pageWidth } from "@/components/ui";

export default function Loading() {
    return <div className={`${pageWidth} p-4 sm:p-8`}><LoadingRegion label="Loading..." /></div>;
}

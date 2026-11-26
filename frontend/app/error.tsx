"use client";

import { RouteError } from "@/components/route-fallback";

export default function ErrorPage({ reset, retry }: { reset: () => void; retry?: () => void }) {
    return <RouteError onRetry={retry ?? reset} />;
}

"use client";

import { RouteError } from "@/components/route-fallback";
import { body } from "./fonts";
import "./globals.css";

export default function GlobalError({ reset, retry }: { reset?: () => void; retry?: () => void }) {
    return (
        <html lang="en" className={`${body.variable} h-full antialiased`}>
            <body className="min-h-full">
                <RouteError onRetry={retry ?? reset ?? (() => window.location.reload())} />
            </body>
        </html>
    );
}

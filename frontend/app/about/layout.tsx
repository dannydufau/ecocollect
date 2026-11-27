import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
    title: "About",
    description:
        "How EcoCollect connects Calgary residents and volunteers to coordinate e-waste pickups, protect privacy, and award EcoPoints.",
    alternates: { canonical: "/about" },
    openGraph: {
        title: "About · EcoCollect",
        description:
            "Calgary's community e-waste courier: four pickup steps, nine accepted categories, privacy by architecture, and transparent EcoPoints.",
        type: "website",
        siteName: "EcoCollect",
    },
};

export default function AboutLayout({ children }: { children: ReactNode }) {
    return children;
}

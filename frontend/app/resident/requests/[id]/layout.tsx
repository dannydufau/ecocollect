import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: { default: "Pickup request", template: "%s · EcoCollect" } };

export default function Layout({ children }: { children: ReactNode }) {
    return children;
}

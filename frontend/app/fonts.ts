import { Caprasimo, Figtree } from "next/font/google";

export const heading = Caprasimo({
    variable: "--font-heading",
    weight: "400",
    subsets: ["latin"],
});

export const body = Figtree({
    variable: "--font-body",
    weight: ["400", "500", "600", "700"],
    subsets: ["latin"],
});

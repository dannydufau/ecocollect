import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "EcoCollect",
        short_name: "EcoCollect",
        start_url: "/",
        display: "standalone",
        background_color: "#f5ead8",
        theme_color: "#f5ead8",
        icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
    };
}

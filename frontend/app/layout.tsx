import type { Metadata, Viewport } from "next";
import { Caprasimo, Figtree } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import AppHeader from "@/components/app-header";
import DemoBanner from "@/components/demo-banner";

const heading = Caprasimo({
  variable: "--font-heading",
  weight: "400",
  subsets: ["latin"],
});

const body = Figtree({
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EcoCollect",
  description: "E-waste pickup requests",
};

export const viewport: Viewport = { themeColor: "#f5ead8" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${heading.variable} ${body.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-20 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-full focus:bg-text focus:px-4 focus:text-bg">
            Skip to main content
          </a>
          <DemoBanner />
          <AppHeader />
          {/* The pages keep their own width and padding. Bottom padding keeps the phone bottom bar from covering the end of the page. */}
          <div id="main-content" tabIndex={-1} className="flex w-full flex-1 flex-col pb-20 min-[960px]:pb-0">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}

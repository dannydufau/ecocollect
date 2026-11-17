import type { Metadata } from "next";
import { Caprasimo, Figtree } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import AppHeader from "@/components/app-header";

const heading = Caprasimo({
  variable: "--font-heading",
  weight: "400",
  subsets: ["latin"],
});

const body = Figtree({
  variable: "--font-body",
  weight: ["400", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EcoCollect",
  description: "E-waste pickup requests",
};

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
          <AppHeader />
          {/* Bottom padding keeps the phone bottom bar from covering the end of the page */}
          <div id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-6 pb-20 min-[960px]:pb-6">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}

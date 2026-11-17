"use client";

import { useEffect, useId, useState, useSyncExternalStore, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import LogoutButton from "@/components/logout-button";
import { linkButton, textLink } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import type { Role } from "@/lib/auth";

type NavLink = { href: string; label: string; short?: string };

const roleLinks: Record<Role, NavLink[]> = {
    resident: [
        { href: "/resident", label: "My requests", short: "Requests" },
        { href: "/resident/requests/new", label: "New request", short: "New" },
    ],
    volunteer: [
        { href: "/volunteer", label: "Available" },
        { href: "/volunteer/history", label: "History", short: "Assignments" },
    ],
};
const sharedLinks: NavLink[] = [
    { href: "/ecopoints", label: "EcoPoints", short: "Points" },
    { href: "/notifications", label: "Notifications" },
    { href: "/profile", label: "Profile" },
];
const roleNames: Record<Role, string> = { resident: "Resident", volunteer: "Volunteer" };
const topLink = "inline-flex min-h-11 items-center rounded-full px-3 font-semibold hover:bg-surface aria-[current=page]:bg-text aria-[current=page]:text-bg";
const bottomLink = "flex min-h-14 items-center justify-center px-1 text-sm font-semibold aria-[current=page]:bg-text aria-[current=page]:text-bg";

function subscribe(onChange: () => void) {
    window.addEventListener("resize", onChange);
    return () => window.removeEventListener("resize", onChange);
}

function Bar({ children }: { children?: ReactNode }) {
    return (
        <header className="border-b border-divider">
            <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
                <Link href="/" className="inline-flex min-h-11 items-center gap-2 font-[family-name:var(--font-heading)] text-xl">
                    <Image src="/ecocollect-mark.png" alt="" width={31} height={32} />
                    EcoCollect
                </Link>
                {children}
            </div>
        </header>
    );
}

export default function AppHeader() {
    const { user, roles, activeRole, loading, setActiveRole } = useAuth();
    const pathname = usePathname();
    const router = useRouter();
    const moreId = useId();
    // The server does not know the width, so it and the hydration render both use the wide layout
    const wide = useSyncExternalStore(subscribe, () => window.innerWidth >= 960, () => true);
    // The menu remembers the page it was opened on, so going to another page closes it
    const [moreOpenOn, setMoreOpenOn] = useState<string | null>(null);
    const moreOpen = moreOpenOn === pathname;

    useEffect(() => {
        if (!moreOpen) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setMoreOpenOn(null);
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [moreOpen]);

    if (loading || pathname === "/login" || pathname === "/register" || pathname === "/demo" || pathname.startsWith("/demo/")) {
        return <Bar />;
    }
    if (!user) {
        return (
            <Bar>
                <div className="ml-auto flex flex-wrap items-center gap-4">
                    <Link href="/stats" className={textLink}>Community stats</Link>
                    <Link href="/login" className={linkButton}>Sign in</Link>
                </div>
            </Bar>
        );
    }
    if (pathname === "/choose-role") {
        return <Bar><div className="ml-auto"><LogoutButton /></div></Bar>;
    }

    const links = [...(activeRole ? roleLinks[activeRole] : []), ...sharedLinks];
    // Only the longest matching link is the current page, so /resident/requests/new does not also mark /resident
    const current = links
        .filter((link) => pathname === link.href || pathname.startsWith(`${link.href}/`))
        .sort((a, b) => b.href.length - a.href.length)[0];
    const both = roles.includes("resident") && roles.includes("volunteer");

    function switchTo(role: Role) {
        setActiveRole(role);
        setMoreOpenOn(null);
        router.push(`/${role}`);
    }

    function navLinks(list: NavLink[], className: string, short = false) {
        return list.map((link) => (
            <Link key={link.href} href={link.href} aria-current={link === current ? "page" : undefined}
                onClick={() => setMoreOpenOn(null)} className={className}>
                {short ? link.short ?? link.label : link.label}
            </Link>
        ));
    }

    const roleTag = roles.length === 1 && (
        <span className="rounded-full bg-surface px-3 py-1 text-sm font-semibold">{roleNames[roles[0]]}</span>
    );
    const switcher = both && (
        <div role="group" aria-label="Acting as" className="flex flex-wrap items-center gap-2">
            <span aria-hidden="true">Acting as:</span>
            {(["resident", "volunteer"] as const).map((role) => (
                <button key={role} type="button" aria-pressed={activeRole === role} onClick={() => switchTo(role)}
                    className={`min-h-11 rounded-full border px-4 font-semibold ${activeRole === role
                        ? "border-text bg-text text-bg"
                        : "border-neutral-600 hover:bg-surface"}`}>
                    {roleNames[role]}
                </button>
            ))}
        </div>
    );

    if (wide) {
        return (
            <Bar>
                <nav aria-label="Main" className="flex flex-wrap gap-1">{navLinks(links, topLink)}</nav>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    {switcher}
                    {roleTag}
                    <span data-slot="bell" />
                    <LogoutButton />
                </div>
            </Bar>
        );
    }

    return (
        <>
            <Bar>
                <div className="ml-auto flex items-center gap-2">
                    {roleTag}
                    <span data-slot="bell" />
                </div>
            </Bar>
            <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-10 border-t border-divider bg-bg">
                <div id={moreId} hidden={!moreOpen}
                    className="absolute inset-x-0 bottom-full flex flex-col items-start gap-2 border-t border-divider bg-bg p-4">
                    {switcher}
                    {navLinks(links.slice(3), topLink)}
                    <LogoutButton />
                </div>
                <div className="mx-auto grid max-w-3xl grid-cols-4">
                    {navLinks(links.slice(0, 3), bottomLink, true)}
                    <button type="button" aria-expanded={moreOpen} aria-controls={moreId}
                        onClick={() => setMoreOpenOn(moreOpen ? null : pathname)} className={bottomLink}>
                        More
                    </button>
                </div>
            </nav>
        </>
    );
}

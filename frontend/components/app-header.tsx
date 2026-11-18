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
const ecoPoints: NavLink = { href: "/ecopoints", label: "EcoPoints", short: "Points" };
const profile: NavLink = { href: "/profile", label: "Profile" };
const roleNames: Record<Role, string> = { resident: "Resident", volunteer: "Volunteer" };
const topLink = "inline-flex min-h-11 items-center rounded-full px-4 hover:bg-accent-100 aria-[current=page]:bg-accent-200 aria-[current=page]:font-bold";
const bottomLink = "flex min-h-14 items-center justify-center rounded-xl px-1 text-sm font-medium hover:bg-accent-100 aria-[current=page]:bg-accent-200 aria-[current=page]:font-bold";
const roleColors: Record<Role, string> = { resident: "bg-accent-700", volunteer: "bg-accent-2-800" };

function subscribe(onChange: () => void) {
    window.addEventListener("resize", onChange);
    return () => window.removeEventListener("resize", onChange);
}

function Bar({ home = "/login", children }: { home?: string; children?: ReactNode }) {
    return (
        <header>
            <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-8">
                <Link href={home} className="inline-flex min-h-11 items-center gap-2 font-[family-name:var(--font-heading)] text-xl">
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
        return <Bar home="/choose-role"><div className="ml-auto"><LogoutButton /></div></Bar>;
    }

    const middle = [...(activeRole ? roleLinks[activeRole] : []), ecoPoints];
    // Only the longest matching link is the current page, so /resident/requests/new does not also mark /resident
    const current = [...middle, profile]
        .filter((link) => pathname === link.href || pathname.startsWith(`${link.href}/`))
        .sort((a, b) => b.href.length - a.href.length)[0];
    const both = roles.includes("resident") && roles.includes("volunteer");

    const home = activeRole ? `/${activeRole}` : "/choose-role";

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

    // A one-role account always has its role. A both-roles account shows the tag only where the switcher is hidden.
    const shownRole = activeRole ?? (roles.length === 1 ? roles[0] : null);
    const roleTag = shownRole && !(wide && both) && (
        <span className={`rounded-full px-3 py-1 text-sm font-bold text-white ${roleColors[shownRole]}`}>{roleNames[shownRole]}</span>
    );
    const switcher = both && (
        <div className="flex items-center gap-3">
            <span className="text-sm text-neutral-800">Acting as</span>
            <div role="group" aria-label="Active role" className="flex rounded-full bg-surface p-[3px]">
                {(["resident", "volunteer"] as const).map((role) => (
                    <button key={role} type="button" aria-pressed={activeRole === role} onClick={() => switchTo(role)}
                        className={`min-h-[38px] rounded-full px-4 text-sm font-semibold ${activeRole === role ? `${roleColors[role]} text-white` : "hover:bg-accent-100"}`}>
                        {roleNames[role]}
                    </button>
                ))}
            </div>
        </div>
    );

    if (wide) {
        return (
            <Bar home={home}>
                <nav aria-label="Main" className="flex flex-wrap gap-1">{navLinks(middle, topLink)}</nav>
                <div className="ml-auto flex flex-wrap items-center gap-3">
                    {switcher}
                    {roleTag}
                    <span data-slot="bell" />
                    {navLinks([profile], topLink)}
                    <LogoutButton />
                </div>
            </Bar>
        );
    }

    return (
        <>
            <Bar home={home}>
                <div className="ml-auto flex items-center gap-2">
                    {roleTag}
                    <span data-slot="bell" />
                </div>
            </Bar>
            <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-10 border-t border-divider bg-bg">
                <div id={moreId} hidden={!moreOpen}
                    className="absolute inset-x-0 bottom-full flex flex-col items-start gap-2 border-t border-divider bg-bg p-4">
                    {switcher}
                    {navLinks([...middle.slice(3), profile], topLink)}
                    <LogoutButton />
                </div>
                <div className="mx-auto grid max-w-3xl grid-cols-4">
                    {navLinks(middle.slice(0, 3), bottomLink, true)}
                    <button type="button" aria-expanded={moreOpen} aria-controls={moreId}
                        onClick={() => setMoreOpenOn(moreOpen ? null : pathname)} className={bottomLink}>
                        More
                    </button>
                </div>
            </nav>
        </>
    );
}

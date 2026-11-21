"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import LogoutButton from "@/components/logout-button";
import NotificationBell from "@/components/notification-bell";
import { ChevronRightIcon, LeafIcon, MapPinIcon, PackageIcon, PlusIcon, TruckIcon, linkButton, textLink } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import type { Role } from "@/lib/auth";

type NavLink = { href: string; label: string; short?: string; icon?: (props: { className?: string }) => ReactNode };

const roleLinks: Record<Role, NavLink[]> = {
    resident: [
        { href: "/resident", label: "My requests", short: "Requests", icon: PackageIcon },
        { href: "/resident/requests/new", label: "New request", short: "New", icon: PlusIcon },
    ],
    volunteer: [
        { href: "/volunteer", label: "Available", icon: MapPinIcon },
        { href: "/volunteer/history", label: "Assignments", icon: TruckIcon },
    ],
};
const ecoPoints: NavLink = { href: "/ecopoints", label: "EcoPoints", short: "Points", icon: LeafIcon };
const profile: NavLink = { href: "/profile", label: "Profile" };
const stats: NavLink = { href: "/stats", label: "Community stats" };
const roleNames: Record<Role, string> = { resident: "Resident", volunteer: "Volunteer" };
const topLink = "inline-flex min-h-11 items-center rounded-full px-4 hover:bg-accent-100 aria-[current=page]:bg-accent-200 aria-[current=page]:font-bold";
// The current page is bold, in the role colour and has a bar on top, so it is not told by colour alone
const bottomLink = "relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-sm font-medium hover:bg-accent-100 aria-[current=page]:font-bold aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-4 aria-[current=page]:after:top-0 aria-[current=page]:after:h-[3px] aria-[current=page]:after:rounded-full aria-[current=page]:after:bg-current";
const roleColors: Record<Role, string> = { resident: "bg-accent-700", volunteer: "bg-accent-2-800" };
const activeText: Record<Role, string> = { resident: "aria-[current=page]:text-accent-700", volunteer: "aria-[current=page]:text-accent-2-800" };

function Bar({ home = "/login", children }: { home?: string; children?: ReactNode }) {
    return (
        <header className="sticky top-0 z-20 border-b border-divider bg-bg">
            <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-8">
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
    const moreButton = useRef<HTMLButtonElement>(null);
    const moreMenu = useRef<HTMLDivElement>(null);
    // The menu remembers the page it was opened on, so going to another page closes it
    const [moreOpenOn, setMoreOpenOn] = useState<string | null>(null);
    const moreOpen = moreOpenOn === pathname;

    useEffect(() => {
        if (!moreOpen) return;
        const close = () => {
            setMoreOpenOn(null);
            moreButton.current?.focus();
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") close();
        };
        const onPointer = (event: PointerEvent) => {
            const target = event.target as Node;
            if (!moreMenu.current?.contains(target) && !moreButton.current?.contains(target)) close();
        };
        document.addEventListener("keydown", onKey);
        document.addEventListener("pointerdown", onPointer);
        return () => {
            document.removeEventListener("keydown", onKey);
            document.removeEventListener("pointerdown", onPointer);
        };
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
    const current = [...middle, profile, stats]
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
                {short && link.icon?.({ className: "size-6" })}
                {short ? link.short ?? link.label : link.label}
            </Link>
        ));
    }

    // A one-role account always has its role. A both-roles account shows the tag only on a phone, where the switcher is in More.
    const shownRole = activeRole ?? (roles.length === 1 ? roles[0] : null);
    const roleTag = shownRole && (
        <span className={`rounded-full px-3 py-1 text-sm font-bold text-white ${roleColors[shownRole]} ${both ? "min-[960px]:hidden" : ""}`}>{roleNames[shownRole]}</span>
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

    return (
        <>
            <Bar home={home}>
                <nav aria-label="Main" className="hidden flex-wrap gap-1 min-[960px]:flex">{navLinks(middle, topLink)}</nav>
                <div className="ml-auto flex flex-wrap items-center gap-3">
                    <div className="hidden min-[960px]:block">{switcher}</div>
                    {roleTag}
                    <NotificationBell />
                    <div className="hidden flex-wrap items-center gap-3 min-[960px]:flex">
                        {navLinks([stats, profile], topLink)}
                        <LogoutButton />
                    </div>
                </div>
            </Bar>
            <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-10 border-t border-divider bg-bg pb-[env(safe-area-inset-bottom)] min-[960px]:hidden">
                <div id={moreId} ref={moreMenu} hidden={!moreOpen}
                    className="absolute inset-x-0 bottom-full flex flex-col items-start gap-2 border-t border-divider bg-bg p-4">
                    {switcher}
                    {navLinks([...middle.slice(3), stats, profile], topLink)}
                    <LogoutButton />
                </div>
                <div className="mx-auto grid max-w-3xl grid-cols-4">
                    {navLinks(middle.slice(0, 3), `${bottomLink} ${activeText[activeRole ?? "resident"]}`, true)}
                    <button ref={moreButton} type="button" aria-expanded={moreOpen} aria-controls={moreId}
                        onClick={() => setMoreOpenOn(moreOpen ? null : pathname)} className={bottomLink}>
                        <ChevronRightIcon className={`size-6 ${moreOpen ? "rotate-90" : "-rotate-90"}`} />
                        More
                    </button>
                </div>
            </nav>
        </>
    );
}

"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import LogoutButton from "@/components/logout-button";
import NotificationBell from "@/components/notification-bell";
import { Button, ChevronRightIcon, LeafIcon, MapPinIcon, PackageIcon, PlusIcon, RoleBadge, TruckIcon, linkButton, pageWidth, textLink } from "@/components/ui";
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
// One set of states for the main links, the role switcher and the Account button: hover, pressed, and the current page bold on a darker fill
const topLink = "soft-transition inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-2.5 hover:bg-accent-100 active:bg-accent-200 aria-[current=page]:bg-accent-200 aria-[current=page]:font-bold";
// The current page is bold, in the role colour and has a bar on top, so it is not told by colour alone
const bottomLink = "soft-transition relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-sm font-medium hover:bg-accent-100 aria-[current=page]:font-bold aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-4 aria-[current=page]:after:top-0 aria-[current=page]:after:h-[3px] aria-[current=page]:after:rounded-full aria-[current=page]:after:bg-current";
const roleColors: Record<Role, string> = { resident: "bg-role-resident text-on-accent", volunteer: "bg-role-volunteer text-on-moss" };
const activeText: Record<Role, string> = { resident: "aria-[current=page]:text-role-resident", volunteer: "aria-[current=page]:text-role-volunteer" };

function Bar({ home = "/login", oneRow = false, children }: { home?: string; oneRow?: boolean; children?: ReactNode }) {
    return (
        <header className="sticky top-0 z-20 border-b border-divider bg-bg">
            <div className={`${pageWidth} flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-8 ${oneRow ? "min-[960px]:flex-nowrap min-[960px]:gap-x-2" : ""}`}>
                <Link href={home} className="inline-flex min-h-11 shrink-0 items-center gap-2 font-[family-name:var(--font-heading)] text-xl">
                    <Image src="/ecocollect-mark.png" alt="" width={31} height={32} />
                    EcoCollect
                </Link>
                {children}
            </div>
        </header>
    );
}

// The open state of a menu. It remembers the page it opened on, so going to another page closes it.
function useMenu(pathname: string) {
    const [openOn, setOpenOn] = useState<string | null>(null);
    const open = openOn === pathname;
    const button = useRef<HTMLButtonElement>(null);
    // Focus goes back to the button when asked (Escape, Close). A click outside or a link leaves it where the person put it.
    const giveFocusBack = useRef(false);
    useEffect(() => {
        if (!open && giveFocusBack.current) {
            giveFocusBack.current = false;
            button.current?.focus();
        }
    }, [open]);
    const close = useCallback((focusButton = false) => {
        giveFocusBack.current = focusButton && open;
        setOpenOn(null);
    }, [open]);
    return { open, button, close, toggle: () => setOpenOn(open ? null : pathname) };
}

// The wide header's Account menu: a disclosure with Community stats, Profile and Log out
function AccountMenu({ pathname, links, current }: { pathname: string; links: NavLink[]; current?: NavLink }) {
    const id = useId();
    const { open, button, close, toggle } = useMenu(pathname);
    const panel = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") close(true);
        };
        const onPointer = (event: PointerEvent) => {
            const target = event.target as Node;
            if (!panel.current?.contains(target) && !button.current?.contains(target)) close();
        };
        document.addEventListener("keydown", onKey);
        document.addEventListener("pointerdown", onPointer);
        return () => {
            document.removeEventListener("keydown", onKey);
            document.removeEventListener("pointerdown", onPointer);
        };
    }, [open, close, button]);

    return (
        <div className="relative">
            <button ref={button} type="button" aria-expanded={open} aria-controls={id} onClick={toggle}
                className={`${topLink} gap-1 ${open ? "bg-accent-200" : ""}`}>
                Account
                <ChevronRightIcon className={`size-4 ${open ? "-rotate-90" : "rotate-90"}`} />
            </button>
            <div id={id} ref={panel} hidden={!open}
                className="absolute right-0 top-full z-30 mt-2 flex min-w-52 flex-col items-stretch gap-1 rounded-2xl border border-border bg-surface-elevated p-2 shadow-hover">
                {links.map(link => (
                    <Link key={link.href} href={link.href} aria-current={link === current ? "page" : undefined}
                        onClick={() => close()} className={topLink}>{link.label}</Link>
                ))}
                <LogoutButton />
            </div>
        </div>
    );
}

// The More menu on a phone: a modal bottom sheet. The native dialog holds focus inside, closes on Escape and dims the page.
function MoreSheet({ id, open, onClose, children }: { id: string; open: boolean; onClose: () => void; children: ReactNode }) {
    const ref = useRef<HTMLDialogElement>(null);
    const titleId = `${id}-title`;

    // Closing through state, not through the dialog, lets the slide-out run
    useEffect(() => {
        const dialog = ref.current;
        if (!dialog) return;
        if (open && !dialog.open) dialog.showModal();
        if (!open && dialog.open) dialog.close();
    }, [open]);

    return (
        <dialog ref={ref} id={id} aria-labelledby={titleId} className="more-sheet"
            onCancel={event => { event.preventDefault(); onClose(); }}
            // A tap on the backdrop lands on the dialog itself, not on the content inside it
            onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
            <div className="flex flex-col items-start gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <div className="flex w-full items-center justify-between gap-3">
                    <h2 id={titleId} className="text-title">More</h2>
                    <Button variant="secondary" onClick={onClose}>Close</Button>
                </div>
                {children}
            </div>
        </dialog>
    );
}

export default function AppHeader() {
    const { user, roles, activeRole, loading, verificationState, setActiveRole } = useAuth();
    const pathname = usePathname();
    const router = useRouter();
    const moreId = useId();
    const { open: moreOpen, button: moreButton, close: closeMore, toggle: toggleMore } = useMenu(pathname);

    if (loading || pathname === "/login" || pathname === "/register" || pathname === "/demo" || pathname.startsWith("/demo/")) {
        return <Bar />;
    }
    if (!user) {
        return (
            <Bar>
                <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-4">
                    <Link href="/stats" aria-label="Community stats" className={`${textLink} whitespace-nowrap text-small sm:text-base`}>
                        <span className="sm:hidden">Stats</span>
                        <span className="hidden sm:inline">Community stats</span>
                    </Link>
                    <Link href="/login" className={`${linkButton} whitespace-nowrap px-3 text-small sm:px-5 sm:text-base`}>Sign in</Link>
                </div>
            </Bar>
        );
    }
    if (verificationState !== "verified" || pathname === "/verify-email") {
        return (
            <Bar home="/verify-email">
                <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-4">
                    <Link href="/stats" aria-label="Community stats" className={`${textLink} whitespace-nowrap text-small sm:text-base`}>
                        <span className="sm:hidden">Stats</span>
                        <span className="hidden sm:inline">Community stats</span>
                    </Link>
                    <LogoutButton />
                </div>
            </Bar>
        );
    }
    if (pathname === "/choose-role") {
        return <Bar home="/choose-role"><div className="ml-auto"><LogoutButton /></div></Bar>;
    }

    const both = roles.includes("resident") && roles.includes("volunteer");
    const middle = [
        ...(activeRole ? roleLinks[activeRole] : both ? [roleLinks.resident[0], roleLinks.volunteer[0]] : []),
        ecoPoints,
    ];
    // Only the longest matching link is the current page, so /resident/requests/new does not also mark /resident
    const current = [...middle, profile, stats]
        .filter((link) => pathname === link.href || pathname.startsWith(`${link.href}/`))
        .sort((a, b) => b.href.length - a.href.length)[0];

    const home = activeRole ? `/${activeRole}` : "/choose-role";

    function switchTo(role: Role) {
        setActiveRole(role);
        closeMore(true);
        router.push(`/${role}`);
    }

    function navLinks(list: NavLink[], className: string, short = false) {
        return list.map((link) => (
            <Link key={link.href} href={link.href} aria-current={link === current ? "page" : undefined}
                onClick={() => closeMore(true)} className={className}>
                {short && link.icon?.({ className: "size-6" })}
                {short ? link.short ?? link.label : link.label}
            </Link>
        ));
    }

    // A one-role account shows its role. A both-roles account shows the switcher from 960 px and, on a phone, a badge that switches.
    const shownRole = activeRole ?? (roles.length === 1 ? roles[0] : null);
    const otherRole = shownRole === "resident" ? "volunteer" : "resident";
    const roleTag = shownRole && (both
        ? (
            // The name starts with the visible word, so a voice user can say what they see
            <button type="button" onClick={() => switchTo(otherRole)} aria-label={`${roleNames[shownRole]}. Switch to ${roleNames[otherRole]} view`}
                className="soft-transition inline-flex min-h-11 items-center gap-0.5 rounded-full pr-1 hover:bg-accent-100 active:bg-accent-200 min-[960px]:hidden">
                <RoleBadge role={shownRole} />
                <ChevronRightIcon className="size-4 rotate-90" />
            </button>
        )
        : <RoleBadge role={shownRole} />);
    const switcher = both && (
        <div role="group" aria-label="Active role" className="flex rounded-full bg-surface p-[3px]">
            {(["resident", "volunteer"] as const).map((role) => (
                <button key={role} type="button" aria-pressed={activeRole === role} onClick={() => switchTo(role)}
                    className={`soft-transition min-h-[38px] whitespace-nowrap rounded-full px-2.5 text-sm font-semibold ${activeRole === role ? roleColors[role] : "hover:bg-accent-100 active:bg-accent-200"}`}>
                    {roleNames[role]}
                </button>
            ))}
        </div>
    );

    return (
        <>
            <Bar home={home} oneRow>
                <nav aria-label="Main" className="hidden gap-1 min-[960px]:flex">{navLinks(middle, topLink)}</nav>
                <div className="ml-auto flex flex-wrap items-center gap-2 min-[960px]:flex-nowrap">
                    <div className="hidden min-[960px]:block">{switcher}</div>
                    {roleTag}
                    <NotificationBell />
                    <div className="hidden min-[960px]:block"><AccountMenu pathname={pathname} links={[stats, profile]} current={current} /></div>
                </div>
            </Bar>
            <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-10 border-t border-divider bg-bg pb-[env(safe-area-inset-bottom)] min-[960px]:hidden">
                <MoreSheet id={moreId} open={moreOpen} onClose={() => closeMore(true)}>
                    {switcher}
                    {navLinks([...middle.slice(3), stats, profile], topLink)}
                    <LogoutButton />
                </MoreSheet>
                <div className="mx-auto grid max-w-3xl grid-cols-4">
                    {navLinks(middle.slice(0, 3), `${bottomLink} ${activeText[activeRole ?? "resident"]}`, true)}
                    <button ref={moreButton} type="button" aria-haspopup="dialog" aria-expanded={moreOpen} aria-controls={moreId}
                        onClick={toggleMore} className={bottomLink}>
                        <ChevronRightIcon className={`size-6 ${moreOpen ? "rotate-90" : "-rotate-90"}`} />
                        More
                    </button>
                </div>
            </nav>
        </>
    );
}

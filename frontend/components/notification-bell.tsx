"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useNotifications } from "@/lib/use-notifications";

export default function NotificationBell() {
    const count = useNotifications().data?.unreadCount ?? 0;
    const here = usePathname() === "/notifications";
    return (
        <Link href="/notifications" aria-current={here ? "page" : undefined} aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
            className="relative inline-flex size-11 items-center justify-center rounded-full hover:bg-accent-100 aria-[current=page]:bg-accent-200">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
            {count > 0 && <span aria-hidden="true"
                className="absolute -right-1 -top-1 min-w-5 rounded-full bg-danger px-1.5 text-center ring-2 ring-bg text-[12px] font-bold leading-5 text-white">
                {count > 99 ? "99+" : count}
            </span>}
        </Link>
    );
}

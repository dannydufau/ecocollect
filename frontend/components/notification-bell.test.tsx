import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useNotifications } from "@/lib/use-notifications";
import NotificationBell from "./notification-bell";

vi.mock("@/lib/use-notifications", () => ({ useNotifications: vi.fn() }));
const path = vi.hoisted(() => ({ current: "/resident" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.current }));

function show(data?: { unreadCount: number }) {
    vi.mocked(useNotifications).mockReturnValue({ data } as never);
    render(<NotificationBell />);
    return screen.getByRole("link");
}

afterEach(() => {
    path.current = "/resident";
    cleanup();
    vi.resetAllMocks();
});

it("links to the notifications page", () => {
    expect(show({ unreadCount: 0 })).toHaveAttribute("href", "/notifications");
});

it("shows no badge at 0 unread", () => {
    const link = show({ unreadCount: 0 });
    expect(link).toHaveAccessibleName("Notifications");
    expect(link).toHaveTextContent("");
});

it.each([[5, "5"], [99, "99"], [120, "99+"]])("shows %i unread as %s", (count, text) => {
    const link = show({ unreadCount: count });
    expect(link).toHaveTextContent(text);
    expect(link).toHaveAccessibleName(`Notifications, ${count} unread`);
});

it("shows no badge while loading or after an error", () => {
    const link = show(undefined);
    expect(link).toHaveAccessibleName("Notifications");
    expect(link).toHaveTextContent("");
});

it("is the current page on /notifications only", () => {
    expect(show({ unreadCount: 0 })).not.toHaveAttribute("aria-current");
    cleanup();
    path.current = "/notifications";
    expect(show({ unreadCount: 0 })).toHaveAttribute("aria-current", "page");
});

it("rings the badge in the page colour so it stands apart from the bell", () => {
    expect(show({ unreadCount: 5 }).querySelector("span")).toHaveClass("ring-2", "ring-bg");
});

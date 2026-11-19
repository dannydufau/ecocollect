import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatTimestamp } from "@/lib/time";
import type { Notification } from "@/lib/types";
import { renderWithClient } from "@/test/utils";
import NotificationsPage from "./page";

const router = { push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() }, isAuthError: () => false }));

const item = (n: number, patch: Partial<Notification> = {}): Notification => ({
    notificationId: `n${n}`, type: "REQUEST_ASSIGNED_RESIDENT", requestId: `r${n}`, awardId: null,
    title: `Title ${n}`, body: `Body ${n}`, url: `/resident/requests/r${n}`, isRead: false,
    createdAt: new Date(Date.UTC(2026, 10, 20, 12) - n * 60_000).toISOString(), ...patch,
});
const page = (notifications: Notification[], unreadCount = notifications.filter(row => !row.isRead).length) => ({ unreadCount, notifications });
const full = Array.from({ length: 30 }, (_, i) => item(i + 1, { isRead: true }));

function button(title: string) {
    return screen.getByText(title).closest("button")!;
}

let invalidate: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
    vi.mocked(api.get).mockResolvedValue(page([item(1), item(2, { isRead: true })]));
    vi.mocked(api.patch).mockResolvedValue(undefined);
    vi.mocked(api.post).mockResolvedValue(undefined);
    invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
});
afterEach(() => {
    cleanup();
    vi.resetAllMocks();
    vi.restoreAllMocks();
});

it("lists the notifications with title, body, time and the unread count", async () => {
    renderWithClient(<NotificationsPage />);
    expect(await screen.findByText("1 unread")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/api/notifications");
    const first = button("Title 1");
    expect(first).toHaveTextContent("Body 1");
    expect(first).toHaveTextContent(formatTimestamp(item(1).createdAt));
    expect(screen.getAllByRole("listitem").map(row => row.textContent)).toEqual([expect.stringContaining("Title 1"), expect.stringContaining("Title 2")]);
});

it("marks unread rows in text, not only by color", async () => {
    renderWithClient(<NotificationsPage />);
    await screen.findByText("Title 1");
    expect(within(button("Title 1")).getByText("Unread:")).toBeInTheDocument();
    expect(within(button("Title 2")).queryByText("Unread:")).not.toBeInTheDocument();
});

it("marks an unread row as read, then opens its page", async () => {
    renderWithClient(<NotificationsPage />);
    fireEvent.click((await screen.findByText("Title 1")).closest("button")!);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/resident/requests/r1"));
    expect(api.patch).toHaveBeenCalledWith("/api/notifications/n1/read");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notifications"] });
});

it("still opens the page when marking as read fails", async () => {
    vi.mocked(api.patch).mockRejectedValue(new Error("down"));
    renderWithClient(<NotificationsPage />);
    fireEvent.click((await screen.findByText("Title 1")).closest("button")!);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/resident/requests/r1"));
});

it("only navigates for a row that is already read", async () => {
    renderWithClient(<NotificationsPage />);
    fireEvent.click((await screen.findByText("Title 2")).closest("button")!);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/resident/requests/r2"));
    expect(api.patch).not.toHaveBeenCalled();
});

it.each(["https://evil.com", "//evil.com"])("does not follow %s", async url => {
    vi.mocked(api.get).mockResolvedValue(page([item(1, { url, isRead: true })]));
    renderWithClient(<NotificationsPage />);
    fireEvent.click((await screen.findByText("Title 1")).closest("button")!);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(router.push).not.toHaveBeenCalled();
});

it("marks all as read and refreshes the list", async () => {
    renderWithClient(<NotificationsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Mark all read" }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notifications"] }));
    expect(api.post).toHaveBeenCalledWith("/api/notifications/read-all");
});

it("disables Mark all read when nothing is unread", async () => {
    vi.mocked(api.get).mockResolvedValue(page([item(1, { isRead: true })]));
    renderWithClient(<NotificationsPage />);
    expect(await screen.findByRole("button", { name: "Mark all read" })).toBeDisabled();
    expect(screen.getByText("0 unread")).toBeInTheDocument();
});

it("shows the empty state", async () => {
    vi.mocked(api.get).mockResolvedValue(page([]));
    renderWithClient(<NotificationsPage />);
    expect(await screen.findByText("No notifications yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
});

it("hides Load more when the first page is short", async () => {
    renderWithClient(<NotificationsPage />);
    await screen.findByText("Title 1");
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
});

it("loads older ones before the last row, without duplicates, and hides the button at the end", async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => path === "/api/notifications"
        ? page(full)
        : page([item(30, { isRead: true }), item(31, { isRead: true }), item(32, { isRead: true })]));
    renderWithClient(<NotificationsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Title 32")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(`/api/notifications?before=${encodeURIComponent(item(30).createdAt)}`);
    expect(screen.getAllByText("Title 30")).toHaveLength(1);
    expect(screen.getAllByRole("listitem")).toHaveLength(32);
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
});

it("keeps the older pages when the first page is refetched", async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => path === "/api/notifications" ? page(full) : page([item(31, { isRead: true })]));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><NotificationsPage /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    await screen.findByText("Title 31");
    await act(async () => { await client.invalidateQueries({ queryKey: ["notifications"] }); });
    expect(api.get).toHaveBeenCalledTimes(3);
    expect(screen.getByText("Title 31")).toBeInTheDocument();
});

it("shows an error with a retry", async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error("down")).mockResolvedValue(page([item(1)]));
    renderWithClient(<NotificationsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not load your notifications.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Title 1")).toBeInTheDocument();
});

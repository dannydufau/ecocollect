import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { formatTimestamp } from "@/lib/time";
import type { AvailableRequest } from "@/lib/types";
import { renderWithClient } from "@/test/utils";
import AvailableRequests from "./available-requests";

let searchParams = new URLSearchParams();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useSearchParams: () => searchParams, useRouter: () => ({ replace }) }));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));

const row = (overrides: Partial<AvailableRequest> = {}): AvailableRequest => ({
    requestId: "r1", category: { categoryId: "laptops", name: "Computers/Laptops", wasteType: "Electronics" },
    quantity: 2, estimatedWeightKg: 5, postalCode: "T2P1J9",
    windows: [{ windowId: "w1", date: "2026-11-21", startHour: 14 }], expiresAt: "2026-11-21T21:00:00Z", hasPhoto: true,
    ...overrides,
});

// The profile comes first and has no preferred codes, so the list has no filter
function serve(list: unknown) {
    vi.mocked(api.get).mockImplementation(async (path: string) => {
        const value = path === "/api/profile" ? { preferredPostalCodes: [] } : list;
        if (value instanceof Error) throw value;
        return value;
    });
}

beforeEach(() => {
    searchParams = new URLSearchParams();
    replace.mockReset();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T18:00:00Z"));
    vi.mocked(api.get).mockReset();
    serve([row(), row({ requestId: "r2", hasPhoto: false, postalCode: "T3A0B1" })]);
});

// Vitest does not clean the page between tests by itself
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

it("renders each card with category, quantity, weight, postal code and windows, in server order", async () => {
    renderWithClient(<AvailableRequests />);
    const links = await screen.findAllByRole("link", { name: "2 × Computers/Laptops" });
    expect(links.map(link => link.getAttribute("href"))).toEqual(["/volunteer/requests/r1", "/volunteer/requests/r2"]);
    const card = links[0].closest("li")!;
    expect(within(card).getByText("T2P 1J9")).toBeInTheDocument();
    expect(within(card).getByText(/^5.00 kg/)).toBeInTheDocument();
    expect(within(card).getByText("Tomorrow, 2 to 3 p.m.")).toBeInTheDocument();
    expect(within(card).getByText("Sat, Nov 21, 14:00 to 15:00")).toBeInTheDocument();
    expect(within(card).getByText(`Open until ${formatTimestamp("2026-11-21T21:00:00Z")}`)).toBeInTheDocument();
});

it("shows the number of requests", async () => {
    renderWithClient(<AvailableRequests />);
    expect(await screen.findByText("2 requests")).toHaveAttribute("role", "status");
});

it("says 1 request for a single card", async () => {
    serve([row()]);
    renderWithClient(<AvailableRequests />);
    expect(await screen.findByText("1 request")).toHaveAttribute("role", "status");
});

it("has the page title as the h1", () => {
    renderWithClient(<AvailableRequests />);
    expect(screen.getByRole("heading", { level: 1, name: "Available requests" })).toBeInTheDocument();
});

it("shows the photo mark only when the request has a photo", async () => {
    renderWithClient(<AvailableRequests />);
    const [first, second] = await screen.findAllByRole("link", { name: "2 × Computers/Laptops" });
    expect(within(first.closest("li")!).getByText("5.00 kg · Photo")).toBeInTheDocument();
    expect(within(second.closest("li")!).getByText("5.00 kg")).toBeInTheDocument();
});

it("shows the empty state", async () => {
    serve([]);
    renderWithClient(<AvailableRequests />);
    expect(await screen.findByText("No open requests right now.")).toBeInTheDocument();
    expect(screen.getByText(/New requests appear here on their own/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "preferred postal codes in Profile" })).toHaveAttribute("href", "/profile");
});

it("with no saved codes, points to the profile", async () => {
    renderWithClient(<AvailableRequests />);
    expect(await screen.findByRole("link", { name: "profile" })).toHaveAttribute("href", "/profile");
});

it("with a filter and no results, one Show all areas button clears the filter", async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) => path === "/api/profile" ? { preferredPostalCodes: ["T2P1J9"] } : path.includes("postalCodes") ? [] : [row()]);
    renderWithClient(<AvailableRequests />);
    expect(await screen.findByText("No open requests in these areas.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "profile" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Show all areas" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Show all areas" }));
    expect(await screen.findByRole("link", { name: "2 × Computers/Laptops" })).toBeInTheDocument();
    expect(api.get).toHaveBeenLastCalledWith("/api/requests?view=available");
});

it("shows an error", async () => {
    serve(new Error("down"));
    renderWithClient(<AvailableRequests />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not load the requests. Please try again.");
});

it("lets the volunteer try again after an error", async () => {
    serve(new Error("down"));
    renderWithClient(<AvailableRequests />);
    await screen.findByRole("alert");
    serve([row(), row({ requestId: "r2" })]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findAllByRole("link", { name: "2 × Computers/Laptops" })).toHaveLength(2);
});

it("leaves the Assignments link to the header", async () => {
    renderWithClient(<AvailableRequests />);
    await screen.findAllByRole("link", { name: "2 × Computers/Laptops" });
    expect(screen.queryByRole("link", { name: "History" })).not.toBeInTheDocument();
});

it("asks without postalCodes when there are no codes", async () => {
    renderWithClient(<AvailableRequests />);
    await screen.findAllByRole("link", { name: "2 × Computers/Laptops" });
    expect(api.get).toHaveBeenCalledWith("/api/requests?view=available");
});

it("fetches again when the available requests key is invalidated", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AvailableRequests /></QueryClientProvider>);
    await screen.findAllByRole("link", { name: "2 × Computers/Laptops" });
    vi.mocked(api.get).mockClear();
    await client.invalidateQueries({ queryKey: ["requests", "available"] });
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith("/api/requests?view=available");
});

it.each([1, 2, 3])("puts each of %i windows on its own row with both texts", async count => {
    const windows = [{ windowId: "w1", date: "2026-11-21", startHour: 14 }, { windowId: "w2", date: "2026-11-22", startHour: 9 }, { windowId: "w3", date: "2026-11-23", startHour: 10 }].slice(0, count);
    serve([row({ windows })]);
    renderWithClient(<AvailableRequests />);
    const card = (await screen.findByRole("link", { name: "2 × Computers/Laptops" })).closest("li")!;
    const rows = within(within(card).getByRole("list")).getAllByRole("listitem");
    expect(rows).toHaveLength(count);
    for (const item of rows) {
        expect(item).toHaveClass("flex");
        expect(item.querySelector("br")).toBeNull();
        expect(item.children).toHaveLength(2);
    }
});

it("shows the postal code as a badge with a pin icon", async () => {
    serve([row()]);
    renderWithClient(<AvailableRequests />);
    const badge = await screen.findByText("T2P 1J9");
    expect(badge.querySelector("svg[aria-hidden=true]")).not.toBeNull();
    expect(badge).toHaveClass("tabular-nums", "bg-surface", "rounded-full");
});

it("never shows a street address, even if the server sends one", async () => {
    serve([{ ...row(), address: { street: "123 Secret St", postalCode: "T2P1J9" }, notes: "Side door" }]);
    renderWithClient(<AvailableRequests />);
    await screen.findByRole("link", { name: "2 × Computers/Laptops" });
    expect(document.body).not.toHaveTextContent("123 Secret St");
    expect(document.body).not.toHaveTextContent("Side door");
});

it("keeps the old list, dimmed and without a spinner, while the filter changes", async () => {
    let finish!: (rows: AvailableRequest[]) => void;
    vi.mocked(api.get).mockImplementation((path: string) => path === "/api/profile" ? Promise.resolve({ preferredPostalCodes: [] })
        : path.includes("postalCodes") ? new Promise(done => { finish = done as typeof finish; }) : Promise.resolve([row()]));
    renderWithClient(<AvailableRequests />);
    const link = await screen.findByRole("link", { name: "2 × Computers/Laptops" });
    fireEvent.change(screen.getByLabelText("Add a postal code"), { target: { value: "T3A0B1" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await vi.waitFor(() => expect(link.closest("ul")).toHaveClass("opacity-60"));
    expect(link).toBeInTheDocument();
    expect(screen.queryByText("Loading requests...")).not.toBeInTheDocument();
    await act(async () => finish([row({ requestId: "r9" })]));
    await vi.waitFor(() => expect(screen.getByRole("link", { name: "2 × Computers/Laptops" }).closest("ul")).not.toHaveClass("opacity-60"));
});

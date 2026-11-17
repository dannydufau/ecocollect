import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import type { AvailableRequest } from "@/lib/types";
import { renderWithClient } from "@/test/utils";
import AvailableRequests from "./available-requests";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));

const row = (overrides: Partial<AvailableRequest> = {}): AvailableRequest => ({
    requestId: "r1", category: { categoryId: "laptops", name: "Computers/Laptops", wasteType: "Electronics" },
    quantity: 2, estimatedWeightKg: 5, postalCode: "T2P1J9",
    windows: [{ windowId: "w1", date: "2026-11-21", startHour: 14 }], expiresAt: "2026-11-21T21:00:00Z", hasPhoto: true,
    ...overrides,
});

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T18:00:00Z"));
    vi.mocked(api.get).mockReset().mockResolvedValue([row(), row({ requestId: "r2", hasPhoto: false, postalCode: "T3A0B1" })]);
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
    expect(within(card).getByText("5.00 kg · T2P1J9")).toBeInTheDocument();
    expect(within(card).getByText("Tomorrow, 2 to 3 p.m.")).toBeInTheDocument();
});

it("shows the photo mark only when the request has a photo", async () => {
    renderWithClient(<AvailableRequests />);
    const [first, second] = await screen.findAllByRole("link", { name: "2 × Computers/Laptops" });
    expect(within(first.closest("li")!).getByText("Photo")).toBeInTheDocument();
    expect(within(second.closest("li")!).queryByText("Photo")).not.toBeInTheDocument();
});

it("shows the empty state", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    renderWithClient(<AvailableRequests />);
    expect(await screen.findByText("Nothing available right now")).toBeInTheDocument();
});

it("shows an error", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("down"));
    renderWithClient(<AvailableRequests />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not load the requests. Please try again.");
});

it("links to the history page", () => {
    renderWithClient(<AvailableRequests />);
    expect(screen.getByRole("link", { name: "History" })).toHaveAttribute("href", "/volunteer/history");
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
    expect(api.get).toHaveBeenCalledTimes(1);
    await client.invalidateQueries({ queryKey: ["requests", "available"] });
    expect(api.get).toHaveBeenCalledTimes(2);
});

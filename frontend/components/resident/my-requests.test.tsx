import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { api } from "@/lib/api";
import type { MyRequest } from "@/lib/types";
import { renderWithClient } from "@/test/utils";
import MyRequests from "./my-requests";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() }, isAuthError: () => false }));
const request = (overrides: Partial<MyRequest> = {}): MyRequest => ({
    requestId: "r1", category: { categoryId: "laptops", name: "Computers/Laptops", wasteType: "Computers" },
    quantity: 2, estimatedWeightKg: 5, status: "Open", createdAt: "2026-11-15T15:00:00Z",
    expiresAt: "2026-11-20T15:00:00Z", hasPhoto: true, ...overrides,
});
beforeEach(() => vi.mocked(api.get).mockResolvedValue([request()]));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("renders the current contract fields and keeps server order", async () => {
    vi.mocked(api.get).mockResolvedValue([request(), request({ requestId: "r2", status: "Delivered", hasPhoto: false, createdAt: "2026-11-16T15:00:00Z" })]);
    renderWithClient(<MyRequests />);
    await screen.findAllByRole("link", { name: "Computers/Laptops" });
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByRole("link")).toHaveAttribute("href", "/resident/requests/r1");
    expect(within(rows[1]).getByRole("link")).toHaveAttribute("href", "/resident/requests/r2");
    expect(within(rows[0]).getByText("Open")).toBeInTheDocument();
    expect(within(rows[0]).getByText(/Quantity: 2.*5.00 kg/)).toBeInTheDocument();
    expect(within(rows[0]).getByText("Has photo")).toBeInTheDocument();
    expect(within(rows[1]).queryByText("Has photo")).not.toBeInTheDocument();
});
it("filters by Missed and returns to the unfiltered list with one active button", async () => {
    renderWithClient(<MyRequests />);
    await screen.findByRole("link", { name: "Computers/Laptops" });
    fireEvent.click(screen.getByRole("button", { name: "Missed" }));
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith("/api/requests?view=mine&status=Missed"));
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Missed" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith("/api/requests?view=mine"));
});
it("shows an empty state and a new request link", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    renderWithClient(<MyRequests />);
    expect(await screen.findByText("You have not made any requests yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New request" })).toHaveAttribute("href", "/resident/requests/new");
});
it("shows an API error and lets the resident retry", async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error("Unavailable"));
    renderWithClient(<MyRequests />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not load your requests.");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(await screen.findByRole("link", { name: "Computers/Laptops" })).toBeInTheDocument();
});
it.each([["1", "Your request was created."], ["2", "2 requests were created."]])("shows confirmation for created=%s", async (created, message) => {
    renderWithClient(<MyRequests created={created} />);
    expect(screen.getByText(message)).toBeInTheDocument();
    await screen.findByRole("link", { name: "Computers/Laptops" });
});
it.each(["0", "-1", "oops", "2.5"])("ignores invalid created=%s", async created => {
    renderWithClient(<MyRequests created={created} />);
    await screen.findByRole("link", { name: "Computers/Laptops" });
    expect(screen.queryByText(/requests? (was|were) created/)).not.toBeInTheDocument();
});

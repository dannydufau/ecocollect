import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
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
    await screen.findAllByRole("link", { name: "2 × Computers/Laptops" });
    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByRole("link")).toHaveAttribute("href", "/resident/requests/r1");
    expect(within(rows[1]).getByRole("link")).toHaveAttribute("href", "/resident/requests/r2");
    expect(within(rows[0]).getByText("Open")).toBeInTheDocument();
    expect(within(rows[0]).getByText(/5.00 kg · Created/)).toBeInTheDocument();
    expect(within(rows[0]).getByText(/Expires/)).toBeInTheDocument();
    expect(within(rows[1]).queryByText(/Expires/)).not.toBeInTheDocument();
    expect(within(rows[0]).getByText(/Has photo/)).toBeInTheDocument();
    expect(screen.getByText("Times are Calgary time.")).toBeInTheDocument();
    expect(within(rows[1]).queryByText(/Has photo/)).not.toBeInTheDocument();
});
it("filters by Missed and returns to the unfiltered list with one active button", async () => {
    renderWithClient(<MyRequests />);
    await screen.findByRole("link", { name: "2 × Computers/Laptops" });
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
    expect(await screen.findByText("You have no requests yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create your first request" })).toHaveAttribute("href", "/resident/requests/new");
});
it("says which status has no requests when a filter is empty", async () => {
    renderWithClient(<MyRequests />);
    await screen.findByRole("link", { name: "2 × Computers/Laptops" });
    vi.mocked(api.get).mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button", { name: "Expired" }));
    expect(await screen.findByText("You have no expired requests.")).toBeInTheDocument();
});
it("keeps the old rows on screen while a new filter loads", async () => {
    renderWithClient(<MyRequests />);
    await screen.findByRole("link", { name: "2 × Computers/Laptops" });
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith("/api/requests?view=mine&status=Open"));
    expect(screen.getByRole("link", { name: "2 × Computers/Laptops" })).toBeInTheDocument();
});
it("shows an API error and lets the resident retry", async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error("Unavailable"));
    renderWithClient(<MyRequests />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not load your requests.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "2 × Computers/Laptops" })).toBeInTheDocument();
});
it.each([["1", "Your request was created."], ["2", "2 requests were created."]])("shows confirmation for created=%s", async (created, message) => {
    renderWithClient(<MyRequests created={created} />);
    expect(screen.getByText(message)).toBeInTheDocument();
    await screen.findByRole("link", { name: "2 × Computers/Laptops" });
});
it.each(["0", "-1", "oops", "2.5"])("ignores invalid created=%s", async created => {
    renderWithClient(<MyRequests created={created} />);
    await screen.findByRole("link", { name: "2 × Computers/Laptops" });
    expect(screen.queryByText(/requests? (was|were) created/)).not.toBeInTheDocument();
});

it("shows the shared loading indicator until the first response", async () => {
    let resolve!: (value: MyRequest[]) => void;
    vi.mocked(api.get).mockReturnValueOnce(new Promise<MyRequest[]>(done => { resolve = done; }));
    renderWithClient(<MyRequests />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading your requests...");
    await act(async () => resolve([request()]));
    await screen.findByRole("link", { name: "Computers/Laptops" });
    expect(screen.queryByText("Loading your requests...")).not.toBeInTheDocument();
});
it("keeps rows visible while a different filter loads, then replaces them", async () => {
    let resolve!: (value: MyRequest[]) => void;
    vi.mocked(api.get).mockResolvedValueOnce([request()]).mockReturnValueOnce(new Promise<MyRequest[]>(done => { resolve = done; }));
    renderWithClient(<MyRequests />);
    await screen.findByRole("link", { name: "Computers/Laptops" });
    fireEvent.click(screen.getByRole("button", { name: "Missed" }));
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith("/api/requests?view=mine&status=Missed"));
    expect(screen.getByRole("link", { name: "Computers/Laptops" })).toBeInTheDocument();
    expect(screen.queryByText("Loading your requests...")).not.toBeInTheDocument();
    await act(async () => resolve([]));
    expect(await screen.findByText("You have no missed requests.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Computers/Laptops" })).not.toBeInTheDocument();
});

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { formatTimestamp } from "@/lib/time";
import type { RequestDetail } from "@/lib/types";
import { renderWithClient } from "@/test/utils";
import VolunteerRequestDetail from "./request-detail";

vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("firebase/auth", () => ({ signOut: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const open: RequestDetail = {
    requestId: "r1", status: "Open", viewer: "volunteer",
    category: { categoryId: "laptops", name: "Computers/Laptops", wasteType: "Computers" },
    quantity: 2, estimatedWeightKg: 5, postalCode: "T2P1J9",
    createdAt: "2026-11-14T18:00:00Z", expiresAt: "2026-11-20T18:00:00Z",
    windows: [{ windowId: "w1", date: "2026-11-20", startHour: 11 }],
    photoUrl: "https://images.example.test/item.jpg", allowedActions: ["accept"], refreshAt: null,
};
const assignment: NonNullable<RequestDetail["assignment"]> = {
    assignmentId: "a1", volunteer: { accountId: "danny", publicName: "Danny" },
    window: { windowId: "w1", date: "2026-11-20", startHour: 11 }, status: "Active",
    acceptedAt: "2026-11-15T18:00:00Z", collectedAt: null, endedAt: null,
    endReason: null, outsideCancellationWindow: false,
};
const active: RequestDetail = {
    ...open, status: "Assigned", viewer: "assigned_volunteer",
    address: { street: "101 Example Street SW", postalCode: "T2P1J9" }, notes: "Side door",
    resident: { accountId: "jas", publicName: "Jas" }, assignment, allowedActions: ["cancel_assignment"],
};
const collected: RequestDetail = {
    ...active, status: "Collected", assignment: { ...assignment, collectedAt: "2026-11-20T18:30:00Z" }, allowedActions: ["record_delivery"],
};

function show(detail: RequestDetail) {
    vi.mocked(api.getWithMeta).mockResolvedValue({ data: detail, serverDate: new Date("2026-11-16T18:00:00Z") });
    renderWithClient(<VolunteerRequestDetail requestId="r1" />);
    return screen.findByRole("heading", { level: 1 });
}

beforeEach(() => { vi.spyOn(api, "getWithMeta"); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("shows an Open request without address, notes or resident, and an Accept button", async () => {
    expect(await show(open)).toHaveTextContent("2 × Computers/Laptops");
    expect(api.getWithMeta).toHaveBeenCalledWith("/api/requests/r1", { signal: expect.any(AbortSignal) });
    expect(screen.getByText("5.00 kg")).toBeInTheDocument();
    expect(screen.getByText("T2P 1J9")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Photo of the items" })).toHaveAttribute("src", open.photoUrl);
    expect(screen.queryByRole("heading", { name: "Pickup address and notes" })).not.toBeInTheDocument();
    expect(screen.queryByText("Resident")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your pickup" })).not.toBeInTheDocument();
    const actions = screen.getByRole("region", { name: "Request actions" });
    expect(within(actions).getAllByRole("button").map(button => button.textContent)).toEqual(["Accept request"]);
    expect(within(actions).getByRole("button", { name: "Accept request" })).toBeEnabled();
});

it("shows when an Open request closes", async () => {
    await show(open);
    expect(screen.getByText("Open until").nextElementSibling).toHaveTextContent(formatTimestamp(open.expiresAt));
});

it("tells a volunteer who owns the request that it is their own", async () => {
    await show({ ...open, viewer: "owner", allowedActions: ["accept", "edit"] });
    expect(screen.getByText("This is your own request. You can accept it like any other volunteer.")).toBeInTheDocument();
});

it("does not say that for another resident's request", async () => {
    await show(open);
    expect(screen.queryByText(/your own request/)).not.toBeInTheDocument();
});

it("shows the next step sentence once, without a label", async () => {
    await show(open);
    expect(screen.getByText("Open for pickup.")).toBeInTheDocument();
    expect(screen.queryByText("What happens next:")).not.toBeInTheDocument();
});

it("shows the address, notes, resident and assignment for the assigned volunteer", async () => {
    await show(active);
    expect(screen.getByText("101 Example Street SW")).toBeInTheDocument();
    expect(screen.getByText("Side door")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Jas" })).toHaveAttribute("href", "/profiles/jas");
    expect(screen.getByText("After you collect the items, the resident confirms the collection.")).toBeInTheDocument();
    const pickup = screen.getByRole("region", { name: "Your pickup" });
    expect(pickup).toHaveTextContent(`Accepted ${formatTimestamp(assignment.acceptedAt)}`);
    expect(screen.getByRole("button", { name: "Cancel assignment" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Accept request" })).not.toBeInTheDocument();
});

it("states the delivery step once and shows Record delivery when collected", async () => {
    await show(collected);
    expect(screen.getAllByText("Take the items to a facility and record the delivery.")).toHaveLength(1);
    expect(screen.queryByText(/Your action is needed/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record delivery" })).toBeEnabled();
    expect(screen.getByRole("region", { name: "Your pickup" })).toHaveTextContent(`Collected ${formatTimestamp("2026-11-20T18:30:00Z")}`);
});

it("shows the delivery once it is recorded", async () => {
    await show({ ...collected, status: "Delivered", allowedActions: [], assignment: { ...assignment, status: "Delivered", collectedAt: "2026-11-20T18:30:00Z", endedAt: "2026-11-20T20:00:00Z", endReason: "Delivered" },
        delivery: { facility: { facilityId: "f1", name: "Sample depot" }, deliveredAt: "2026-11-20T20:00:00Z", evidencePhotoUrl: "https://images.example.test/proof.jpg" } });
    const delivery = screen.getByRole("region", { name: "Delivery" });
    expect(delivery).toHaveTextContent("Sample depot");
    expect(delivery).toHaveTextContent(`Delivered ${formatTimestamp("2026-11-20T20:00:00Z")}`);
    expect(within(delivery).getByRole("img", { name: "Delivery photo" })).toHaveAttribute("src", "https://images.example.test/proof.jpg");
    expect(within(delivery).getByRole("link", { name: "See my EcoPoints" })).toHaveAttribute("href", "/ecopoints");
    expect(screen.queryByText("After you collect the items, the resident confirms the collection.")).not.toBeInTheDocument();
});

it("never shows an address the server left out", async () => {
    await show({ ...active, address: undefined, notes: null });
    expect(screen.queryByText("101 Example Street SW")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Pickup address and notes" })).not.toBeInTheDocument();
});

it("says the request is gone when the server answers request_unavailable", async () => {
    vi.mocked(api.getWithMeta).mockRejectedValue(new ApiError(404, { error: { code: "request_unavailable", message: "gone" } }));
    renderWithClient(<VolunteerRequestDetail requestId="r1" />);
    expect(await screen.findByRole("heading", { name: "This request is no longer available" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to available requests" })).toHaveAttribute("href", "/volunteer");
});

it("shows the loading state first", () => {
    vi.mocked(api.getWithMeta).mockReturnValue(new Promise(() => {}));
    renderWithClient(<VolunteerRequestDetail requestId="r1" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading the request...");
});

it("shows an error with a retry", async () => {
    vi.mocked(api.getWithMeta).mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue({ data: open, serverDate: new Date() });
    renderWithClient(<VolunteerRequestDetail requestId="r1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not load this request.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "2 × Computers/Laptops" })).toBeInTheDocument();
});

it("keeps the status, next step and buttons in one top card", async () => {
    await show(collected);
    const top = screen.getByRole("region", { name: "Request status" });
    expect(within(top).getByRole("heading", { level: 1 })).toHaveTextContent("2 × Computers/Laptops");
    expect(within(top).getByRole("list", { name: "Request progress" })).toBeInTheDocument();
    expect(within(top).getByText("Take the items to a facility and record the delivery.")).toBeInTheDocument();
    expect(within(top).getByRole("button", { name: "Record delivery" })).toBeInTheDocument();
});

it("shows no street address before accepting, even if the server sent none for an Open request", async () => {
    await show(open);
    expect(document.body).not.toHaveTextContent("101 Example Street SW");
    expect(document.body).not.toHaveTextContent("Side door");
});

it("shows the address card with a moss border after accepting, with a formatted postal code", async () => {
    await show(active);
    const card = screen.getByRole("region", { name: "Pickup address and notes" });
    expect(card).toHaveClass("border-l-4", "border-l-accent-2-700");
    expect(card).not.toHaveClass("bg-accent-200");
    expect(within(card).getByText("T2P 1J9")).toHaveClass("tabular-nums");
});

it("does not repeat the category and quantity from the title in Details", async () => {
    await show(open);
    expect(screen.queryByText("Category")).not.toBeInTheDocument();
    expect(screen.queryByText("Quantity")).not.toBeInTheDocument();
});

const delivered: RequestDetail = {
    ...collected, status: "Delivered", allowedActions: [],
    assignment: { ...assignment, status: "Delivered", collectedAt: "2026-11-20T18:30:00Z", endedAt: "2026-11-20T20:00:00Z", endReason: "Delivered" },
    delivery: { facility: { facilityId: "f1", name: "Sample depot" }, deliveredAt: "2026-11-20T20:00:00Z" },
};

function panel() {
    return screen.getByRole("region", { name: "Request status" });
}

it.each([
    ["Open", open, "Open"],
    ["Assigned", active, "Assigned"],
    ["Collected", collected, "Collected"],
    ["Delivered", delivered, "Delivered"],
] as const)("shows the progress stepper with %s as the current step", async (_name, detail, current) => {
    await show(detail);
    const steps = within(within(panel()).getByRole("list", { name: "Request progress" })).getAllByRole("listitem");
    expect(steps.map(step => step.textContent)).toHaveLength(4);
    expect(steps.filter(step => step.getAttribute("aria-current") === "step").map(step => step.textContent)).toEqual([`${current} (now)`]);
});

it("shows the weight, postal code, windows and closing time at the top of an Open request, and no Details card", async () => {
    await show(open);
    const top = panel();
    expect(top).toHaveTextContent("Estimated weight 5.00 kg");
    expect(top).toHaveTextContent("Postal code T2P 1J9");
    expect(within(top).getByText("Pickup windows offered")).toBeInTheDocument();
    expect(within(top).getByText("Open until").nextElementSibling).toHaveTextContent(formatTimestamp(open.expiresAt));
    expect(screen.queryByRole("region", { name: "Details" })).not.toBeInTheDocument();
});

it("puts the resident, the selected window and the address line above the buttons of an Assigned request", async () => {
    await show(active);
    const top = panel();
    const resident = within(top).getByRole("link", { name: "Jas" });
    expect(resident).toHaveAttribute("href", "/profiles/jas");
    expect(top).toHaveTextContent("Selected window");
    expect(top).toHaveTextContent("The pickup address is shown below.");
    const button = within(top).getByRole("button", { name: "Cancel assignment" });
    expect(resident.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("region", { name: "Details" })).toBeInTheDocument();
});

it("does not say the address is shown when the server sent none", async () => {
    await show({ ...active, address: undefined });
    expect(panel()).not.toHaveTextContent("The pickup address is shown below.");
});

it("puts the resident and the collection time above Record delivery for a Collected request", async () => {
    await show(collected);
    const top = panel();
    const resident = within(top).getByRole("link", { name: "Jas" });
    expect(top).toHaveTextContent(`Collected ${formatTimestamp("2026-11-20T18:30:00Z")}`);
    expect(top).not.toHaveTextContent("The pickup address is shown below.");
    expect(resident.compareDocumentPosition(within(top).getByRole("button", { name: "Record delivery" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("shows the facility and the delivery time at the top of a Delivered request", async () => {
    await show(delivered);
    expect(panel()).toHaveTextContent("Facility Sample depot");
    expect(panel()).toHaveTextContent(`Delivered ${formatTimestamp("2026-11-20T20:00:00Z")}`);
});

it.each([
    ["Open", open, ["Accept request"]],
    ["Assigned", active, ["Cancel assignment"]],
    ["Collected", collected, ["Record delivery"]],
    ["Delivered", delivered, []],
] as const)("shows the buttons of a %s request as the server lists them", async (_state, detail, expected) => {
    await show(detail);
    const group = screen.queryByRole("region", { name: "Request actions" });
    expect(group ? within(group).getAllByRole("button").map(button => button.textContent) : []).toEqual(expected);
});

it("puts Accept and Record delivery before Cancel assignment, and never cancel first", async () => {
    await show({ ...collected, allowedActions: ["cancel_assignment", "record_delivery", "accept"] });
    const group = screen.getByRole("region", { name: "Request actions" });
    expect(within(group).getAllByRole("button").map(button => button.textContent)).toEqual(["Accept request", "Record delivery", "Cancel assignment"]);
    expect(group).toHaveClass("flex-col", "sm:flex-row", "[&>button]:w-full");
});

it("announces a status change that arrives from a refresh", async () => {
    vi.mocked(api.getWithMeta).mockResolvedValue({ data: open, serverDate: new Date("2026-11-16T18:00:00Z") });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><VolunteerRequestDetail requestId="r1" /></QueryClientProvider>);
    await screen.findByRole("heading", { level: 1 });
    const top = panel();
    expect(within(top).getByRole("status")).toBeEmptyDOMElement();
    act(() => { client.setQueryData(queryKeys.request("r1"), { data: active, serverDate: new Date("2026-11-16T18:05:00Z") }); });
    await waitFor(() => expect(within(top).getByRole("status")).toHaveTextContent("Status updated: Assigned."));
});

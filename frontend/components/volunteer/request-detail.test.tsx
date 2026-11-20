import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { api, ApiError } from "@/lib/api";
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
    expect(api.getWithMeta).toHaveBeenCalledWith("/api/requests/r1");
    expect(screen.getByText("5.00 kg")).toBeInTheDocument();
    expect(screen.getByText("T2P1J9")).toBeInTheDocument();
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

it("shows the what happens next sentence", async () => {
    await show(open);
    expect(screen.getByText("What happens next:").parentElement).toHaveTextContent("What happens next: Open for pickup.");
});

it("shows the address, notes, resident and assignment for the assigned volunteer", async () => {
    await show(active);
    expect(screen.getByText("101 Example Street SW")).toBeInTheDocument();
    expect(screen.getByText("Side door")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Jas" })).toHaveAttribute("href", "/profiles/jas");
    expect(screen.getByText("Waiting for the resident to confirm collection.")).toBeInTheDocument();
    const pickup = screen.getByRole("region", { name: "Your pickup" });
    expect(pickup).toHaveTextContent(`Accepted ${formatTimestamp(assignment.acceptedAt)}`);
    expect(screen.getByRole("button", { name: "Cancel assignment" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Accept request" })).not.toBeInTheDocument();
});

it("shows Record delivery with the action needed alert when collected", async () => {
    await show(collected);
    expect(screen.getByRole("status")).toHaveTextContent("Your action is needed: record the delivery.");
    expect(screen.getByRole("button", { name: "Record delivery" })).toBeDisabled();
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
    expect(screen.queryByText("Waiting for the resident to confirm collection.")).not.toBeInTheDocument();
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

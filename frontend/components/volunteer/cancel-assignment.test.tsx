import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { RequestDetail } from "@/lib/types";
import { renderWithClient } from "@/test/utils";
import CancelAssignment from "./cancel-assignment";
import VolunteerRequestDetail from "./request-detail";

const router = { push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("firebase/auth", () => ({ signOut: vi.fn() }));
HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };

const window = { windowId: "w1", date: "2026-11-20", startHour: 11 };
const request: RequestDetail = {
    requestId: "r1", status: "Assigned", viewer: "assigned_volunteer",
    category: { categoryId: "laptops", name: "Computers/Laptops", wasteType: "Computers" },
    quantity: 2, estimatedWeightKg: 5, postalCode: "T2P1J9",
    createdAt: "2026-11-14T18:00:00Z", expiresAt: "2026-11-20T18:00:00Z", windows: [window],
    assignment: {
        assignmentId: "a1", volunteer: { accountId: "danny", publicName: "Danny" }, window, status: "Active",
        acceptedAt: "2026-11-15T18:00:00Z", collectedAt: null, endedAt: null, endReason: null, outsideCancellationWindow: true,
    },
    allowedActions: ["cancel_assignment"], refreshAt: null,
};

let invalidate: ReturnType<typeof vi.spyOn>;

function openDialog() {
    renderWithClient(<CancelAssignment request={request} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel assignment" }));
    return screen.getByRole("dialog");
}
const confirm = (dialog: HTMLElement) => fireEvent.click(within(dialog).getByRole("button", { name: "Cancel assignment" }));

beforeEach(() => {
    vi.spyOn(api, "post").mockResolvedValue(request);
    invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); router.push.mockReset(); });

it("says what happens to the request and that no EcoPoints are earned", () => {
    const dialog = openDialog();
    expect(within(dialog).getByRole("heading", { name: "Cancel your assignment?" })).toBeInTheDocument();
    expect(dialog).toHaveTextContent("The request goes back to Open if it still has future pickup windows. You do not earn EcoPoints for cancelling.");
});

it("sends as volunteer without a reason when none was typed", async () => {
    confirm(openDialog());
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/requests/r1/assignment/cancel", { as: "volunteer" }));
});

it("sends the typed reason", async () => {
    const dialog = openDialog();
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "  Car broke down " } });
    confirm(dialog);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/requests/r1/assignment/cancel", { as: "volunteer", reason: "Car broke down" }));
});

it("sends nothing when the dialog is dismissed", () => {
    const dialog = openDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep assignment" }));
    expect(dialog).not.toHaveAttribute("open");
    expect(api.post).not.toHaveBeenCalled();
});

it("refreshes the request and the history, then goes to the history page", async () => {
    confirm(openDialog());
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/volunteer/history"));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["request", "r1"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["requests", "volunteer"] });
});

it("shows the message when the items were already collected", async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError(409, { error: { code: "already_collected", message: "collected" } }));
    const dialog = openDialog();
    confirm(dialog);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("The items have already been collected.");
    expect(router.push).not.toHaveBeenCalled();
});

it("shows the button while cancel_assignment is allowed, even after the window ended", async () => {
    vi.spyOn(api, "getWithMeta").mockResolvedValue({ data: { ...request, windows: [{ windowId: "w0", date: "2026-01-02", startHour: 9 }] }, serverDate: new Date("2026-11-21T18:00:00Z") });
    renderWithClient(<VolunteerRequestDetail requestId="r1" />);
    expect(await screen.findByRole("button", { name: "Cancel assignment" })).toBeEnabled();
});

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { calgaryToday } from "@/lib/time";
import type { RequestDetail } from "@/lib/types";
import CancelAssignment from "./cancel-assignment";
import ResidentRequestDetail from "./request-detail";

vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("firebase/auth", () => ({ signOut: vi.fn() }));
HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };

const window = { windowId: "w1", date: "2026-11-20", startHour: 14 };
const detail = (outsideCancellationWindow = false, patch: Partial<RequestDetail> = {}): RequestDetail => ({
    requestId: "r/1", viewer: "owner", status: "Assigned", allowedActions: ["cancel_assignment"],
    category: { categoryId: "laptops", name: "Computers/Laptops", wasteType: "Computers" },
    quantity: 1, estimatedWeightKg: 2.5, postalCode: "T2P1J9",
    createdAt: new Date().toISOString(), expiresAt: "2026-11-20T18:00:00Z", windows: [window],
    assignment: {
        assignmentId: "a1", volunteer: { accountId: "danny", publicName: "Danny" }, window, status: "Active",
        acceptedAt: "2026-11-15T18:00:00Z", collectedAt: null, endedAt: null, endReason: null, outsideCancellationWindow,
    },
    delivery: null, refreshAt: null, ...patch,
});
const tomorrow = calgaryToday(new Date(Date.now() + 86_400_000));
let client: QueryClient;
const onNotice = vi.fn();

function mount(node = <CancelAssignment request={detail()} onNotice={onNotice} />) {
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
function open() {
    fireEvent.click(screen.getByRole("button", { name: "Cancel volunteer" }));
    return screen.getByRole("dialog");
}
const confirm = (dialog: HTMLElement) => fireEvent.click(within(dialog).getByRole("button", { name: "Cancel volunteer" }));

beforeEach(() => {
    onNotice.mockReset();
    vi.spyOn(api, "post").mockResolvedValue(detail());
});
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); });

it("always sends as resident, with no reason or windows when none were entered", async () => {
    mount();
    confirm(open());
    await waitFor(() => expect(api.post).toHaveBeenCalledExactlyOnceWith("/api/requests/r%2F1/assignment/cancel", { as: "resident" }));
    expect(onNotice).toHaveBeenCalledWith({ kind: "success", text: "The assignment was cancelled." });
});

it("sends the reason and the new windows when they were entered", async () => {
    mount();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const dialog = open();
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: " Away that day " } });
    fireEvent.change(within(dialog).getByLabelText("Date 1"), { target: { value: tomorrow } });
    fireEvent.change(within(dialog).getByLabelText("Start hour 1"), { target: { value: "10" } });
    confirm(dialog);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/requests/r%2F1/assignment/cancel", {
        as: "resident", reason: "Away that day", windows: [{ date: tomorrow, startHour: 10 }],
    }));
    for (const key of [queryKeys.request("r/1"), queryKeys.myRequests, queryKeys.availableRequests, queryKeys.volunteerRequests]) {
        await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: key }));
    }
});

it("does not send windows in the past", () => {
    mount();
    const dialog = open();
    fireEvent.change(within(dialog).getByLabelText("Date 1"), { target: { value: "2020-01-02" } });
    fireEvent.change(within(dialog).getByLabelText("Start hour 1"), { target: { value: "10" } });
    confirm(dialog);
    expect(within(dialog).getAllByRole("alert").map(alert => alert.textContent).join(" ")).toMatch(/future|Choose a date/);
    expect(api.post).not.toHaveBeenCalled();
});

it("warns about points only when the cancel is close to the pickup", () => {
    mount(<CancelAssignment request={detail(true)} onNotice={onNotice} />);
    expect(within(open()).getByText("The pickup is less than 24 hours away. The volunteer will receive EcoPoints for this cancellation.")).toBeInTheDocument();
    cleanup();
    mount();
    expect(within(open()).queryByText(/will receive EcoPoints/)).not.toBeInTheDocument();
});

it("sends nothing when dismissed", () => {
    mount();
    const dialog = open();
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep volunteer" }));
    expect(dialog).not.toHaveAttribute("open");
    expect(api.post).not.toHaveBeenCalled();
});

it("keeps the window_ended sentence on the page and refreshes the request", async () => {
    let current = detail();
    vi.spyOn(api, "getWithMeta").mockImplementation(async () => ({ data: current, serverDate: new Date() }) as never);
    vi.mocked(api.post).mockImplementation(async () => {
        current = detail(false, { allowedActions: ["confirm_collected", "report_missed"] });
        throw new ApiError(409, { error: { code: "window_ended", message: "ended" } });
    });
    mount(<ResidentRequestDetail requestId="r/1" />);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await screen.findByRole("button", { name: "Cancel volunteer" });
    confirm(open());
    const sentence = "The pickup window has ended. Confirm the collection or report a missed pickup.";
    await waitFor(() => expect(screen.queryByRole("button", { name: "Cancel volunteer" })).not.toBeInTheDocument());
    expect(screen.getAllByRole("alert").some(alert => alert.textContent?.includes(sentence))).toBe(true);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.request("r/1") });
});

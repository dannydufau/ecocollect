import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { calgaryToday } from "@/lib/time";
import type { RequestDetail } from "@/lib/types";
import ReportMissed from "./report-missed";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("firebase/auth", () => ({ signOut: vi.fn() }));
HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };

const window = { windowId: "w1", date: "2026-11-18", startHour: 14 };
const request: RequestDetail = {
    requestId: "r/1", viewer: "owner", status: "Assigned", allowedActions: ["confirm_collected", "report_missed"],
    category: { categoryId: "laptops", name: "Computers/Laptops", wasteType: "Computers" },
    quantity: 1, estimatedWeightKg: 2.5, postalCode: "T2P1J9",
    createdAt: "2026-11-14T18:00:00Z", expiresAt: "2026-11-18T21:00:00Z", windows: [window],
    assignment: {
        assignmentId: "a1", volunteer: { accountId: "danny", publicName: "Danny" }, window, status: "Active",
        acceptedAt: "2026-11-15T18:00:00Z", collectedAt: null, endedAt: null, endReason: null, outsideCancellationWindow: false,
    },
    delivery: null, refreshAt: null,
};
const termsBox = "I have read and accept the terms and safety guidelines";
const tomorrow = calgaryToday(new Date(Date.now() + 86_400_000));
const conflict = (code: string) => new ApiError(409, { error: { code, message: code } });
let client: QueryClient;
const onNotice = vi.fn();

function open() {
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><ReportMissed request={request} onNotice={onNotice} /></QueryClientProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Report missed pickup" }));
    return screen.getByRole("dialog");
}
const confirmButton = (dialog: HTMLElement) => within(dialog).getByRole("button", { name: "Report missed pickup" });
async function fillReschedule(dialog: HTMLElement) {
    fireEvent.click(within(dialog).getByLabelText("Create a new request with new pickup windows"));
    fireEvent.change(within(dialog).getByLabelText("Date 1"), { target: { value: tomorrow } });
    fireEvent.change(within(dialog).getByLabelText("Start hour 1"), { target: { value: "10" } });
    fireEvent.click(await within(dialog).findByLabelText(termsBox));
}

beforeEach(() => {
    onNotice.mockReset();
    router.push.mockReset();
    vi.spyOn(api, "get").mockResolvedValue({ termsDocumentId: "terms_3", content: "Some terms", publishedAt: "2026-11-01T00:00:00Z" });
    vi.spyOn(api, "post").mockResolvedValue({ request, rescheduledRequest: null });
});
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); });

it("sends no reschedule without the checkbox and stays on the request", async () => {
    const dialog = open();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: " Nobody came " } });
    fireEvent.click(confirmButton(dialog));
    await waitFor(() => expect(api.post).toHaveBeenCalledExactlyOnceWith("/api/requests/r%2F1/assignment/missed", { reason: "Nobody came" }));
    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
    expect(router.push).not.toHaveBeenCalled();
    for (const key of [queryKeys.request("r/1"), queryKeys.myRequests, queryKeys.availableRequests]) expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
});

it("keeps Confirm disabled until the new windows are valid and the terms accepted, then sends them", async () => {
    const dialog = open();
    fireEvent.click(within(dialog).getByLabelText("Create a new request with new pickup windows"));
    expect(confirmButton(dialog)).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Date 1"), { target: { value: tomorrow } });
    fireEvent.change(within(dialog).getByLabelText("Start hour 1"), { target: { value: "10" } });
    expect(confirmButton(dialog)).toBeDisabled();
    fireEvent.click(await within(dialog).findByLabelText(termsBox));
    expect(confirmButton(dialog)).toBeEnabled();
    fireEvent.click(confirmButton(dialog));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/requests/r%2F1/assignment/missed", {
        reschedule: { windows: [{ date: tomorrow, startHour: 10 }], termsDocumentId: "terms_3" },
    }));
});

it("opens the new request when it was rescheduled", async () => {
    vi.mocked(api.post).mockResolvedValue({ request, rescheduledRequest: { requestId: "r-new" } });
    const dialog = open();
    await fillReschedule(dialog);
    fireEvent.click(confirmButton(dialog));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/resident/requests/r-new?rescheduled=1"));
});

it("shows the window_not_ended message", async () => {
    vi.mocked(api.post).mockRejectedValue(conflict("window_not_ended"));
    const dialog = open();
    fireEvent.click(confirmButton(dialog));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("The pickup window hasn't ended yet.");
    expect(onNotice).toHaveBeenCalledWith({ kind: "error", text: "The pickup window hasn't ended yet." });
});

it("asks to accept the terms again when they changed", async () => {
    vi.mocked(api.post).mockRejectedValue(conflict("terms_outdated"));
    const dialog = open();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await fillReschedule(dialog);
    fireEvent.click(confirmButton(dialog));
    expect(await within(dialog).findByText("The terms have changed. Please read and accept them again.")).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.terms });
    await waitFor(() => expect(within(dialog).getByLabelText(termsBox)).not.toBeChecked());
    expect(confirmButton(dialog)).toBeDisabled();
    expect(onNotice).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "error" }));
});

it("uses the wide dialog and the picker has no card of its own", () => {
    const dialog = open();
    expect(dialog).toHaveClass("max-w-xl");
    fireEvent.click(within(dialog).getByLabelText(/new request with new pickup windows/));
    expect(within(dialog).getByRole("group", { name: "Pickup windows" })).not.toHaveClass("bg-surface-elevated");
});

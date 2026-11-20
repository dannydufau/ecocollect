import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { RequestDetail } from "@/lib/types";
import ResidentRequestDetail from "./request-detail";

vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("firebase/auth", () => ({ signOut: vi.fn() }));

const window = { windowId: "w1", date: "2026-11-20", startHour: 14 };
const detail = (patch: Partial<RequestDetail> = {}): RequestDetail => ({
    requestId: "r/1", viewer: "owner", status: "Assigned", allowedActions: ["confirm_collected"],
    category: { categoryId: "laptops", name: "Computers/Laptops", wasteType: "Computers" },
    quantity: 1, estimatedWeightKg: 2.5, postalCode: "T2P1J9",
    createdAt: "2026-11-14T18:00:00Z", expiresAt: "2026-11-20T18:00:00Z", windows: [window],
    assignment: {
        assignmentId: "a1", volunteer: { accountId: "danny", publicName: "Danny" }, window, status: "Active",
        acceptedAt: "2026-11-15T18:00:00Z", collectedAt: null, endedAt: null, endReason: null, outsideCancellationWindow: false,
    },
    delivery: null, refreshAt: null, ...patch,
});
let client: QueryClient;
let current: RequestDetail;

function mount() {
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(<QueryClientProvider client={client}><ResidentRequestDetail requestId="r/1" /></QueryClientProvider>);
}

beforeEach(() => {
    current = detail();
    vi.spyOn(api, "getWithMeta").mockImplementation(async () => ({ data: current, serverDate: new Date() }) as never);
    vi.spyOn(api, "post").mockImplementation(async () => { current = detail({ status: "Collected", allowedActions: [] }); return current as never; });
});
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); });

it("is hidden without the confirm_collected action", async () => {
    current = detail({ allowedActions: [] });
    mount();
    await screen.findByText("Assigned");
    expect(screen.queryByRole("button", { name: "Confirm collected" })).not.toBeInTheDocument();
});

it("posts once with no body, is disabled while sending, and refreshes the request and my list", async () => {
    let finish!: () => void;
    vi.mocked(api.post).mockImplementation(() => new Promise<never>(resolve => { finish = () => resolve(detail({ status: "Collected", allowedActions: [] }) as never); }));
    mount();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const button = await screen.findByRole("button", { name: "Confirm collected" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(await screen.findByRole("button", { name: "Confirming..." })).toBeDisabled();
    expect(api.post).toHaveBeenCalledExactlyOnceWith("/api/requests/r%2F1/assignment/collected");
    await act(async () => finish());
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.myRequests }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.request("r/1") });
});

it("shows the success on the page after the button goes away", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Confirm collected" }));
    expect(await screen.findByText("Collection confirmed.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Confirm collected" })).not.toBeInTheDocument());
});

it("keeps the not_assigned message on the page when the refetch removes the button", async () => {
    vi.mocked(api.post).mockImplementation(async () => {
        current = detail({ status: "Open", assignment: null, allowedActions: [] });
        throw new ApiError(409, { error: { code: "not_assigned", message: "conflict" } });
    });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Confirm collected" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This request is no longer assigned.");
    await screen.findByText("Open");
    expect(screen.queryByRole("button", { name: "Confirm collected" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("This request is no longer assigned.");
});

it("asks the resident to confirm only after the items were taken", async () => {
    mount();
    expect(await screen.findByText("Confirm only after the volunteer has taken your items.")).toBeInTheDocument();
});

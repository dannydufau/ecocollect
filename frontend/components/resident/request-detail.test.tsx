import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { nextStepText } from "@/lib/status-text";
import { friendlyWindow, formatTimestamp, formatWindow } from "@/lib/time";
import type { RequestDetail } from "@/lib/types";
import { renderWithClient } from "@/test/utils";
import ResidentRequestDetail, { ResidentRequestView } from "./request-detail";
import type { ResidentActionRenderers } from "./request-actions";

vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("firebase/auth", () => ({ signOut: vi.fn() }));

const detail = (overrides: Partial<RequestDetail> = {}): RequestDetail => ({
    requestId: "r1", status: "Open", viewer: "owner",
    category: { categoryId: "laptops", name: "Computers/Laptops", wasteType: "Computers" },
    quantity: 2, estimatedWeightKg: 5, postalCode: "T2P1J9",
    createdAt: "2026-11-14T18:00:00Z", expiresAt: "2026-11-20T18:00:00Z",
    windows: [{ windowId: "w1", date: "2026-11-20", startHour: 11 }],
    address: { street: "101 Example Street SW", postalCode: "T2P1J9" },
    notes: "Use the side entrance.\nPlease ring the bell.", photoUrl: null,
    assignment: null, delivery: null, allowedActions: ["edit", "cancel"], refreshAt: null,
    ...overrides,
});
const assignment: NonNullable<RequestDetail["assignment"]> = {
    assignmentId: "a1", volunteer: { accountId: "maya", publicName: "Maya B." },
    window: { windowId: "w1", date: "2026-11-20", startHour: 11 }, status: "Active",
    acceptedAt: "2026-11-15T18:00:00Z", collectedAt: null, endedAt: null,
    endReason: null, outsideCancellationWindow: false,
};
const delivery: NonNullable<RequestDetail["delivery"]> = {
    facility: { facilityId: "f1", name: "Sample electronics depot" },
    deliveredAt: "2026-11-20T23:00:00Z", evidencePhotoUrl: "https://images.example.test/evidence.jpg",
};
const actionRenderers: ResidentActionRenderers = {
    edit: () => <button>Edit</button>, cancel: () => <button>Cancel request</button>,
    cancel_assignment: () => <button>Cancel assignment</button>,
    confirm_collected: () => <button>Confirm collected</button>, report_missed: () => <button>Report missed pickup</button>,
};
const response = (data = detail()) => ({ data, serverDate: new Date("2026-11-16T18:00:00Z") });

beforeEach(() => { vi.spyOn(api, "getWithMeta").mockResolvedValue(response()); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("includes owner history and the replacement link on the detail page", async () => {
    vi.mocked(api.getWithMeta).mockResolvedValueOnce(response(detail({ status: "Missed", allowedActions: [],
        statusHistory: [{ status: "Missed", changedAt: "2026-11-16T18:00:00Z", reason: "No collection." }],
        rescheduledAs: { requestId: "r2" },
    })));
    renderWithClient(<ResidentRequestDetail requestId="r1" />);
    const history = await screen.findByRole("region", { name: "History" });
    expect(within(history).getByText("Reason: No collection.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View the new request" })).toHaveAttribute("href", "/resident/requests/r2");
});

it("puts the history after the delivery section", () => {
    render(<ResidentRequestView request={detail({ status: "Delivered", allowedActions: [], assignment, delivery,
        statusHistory: [{ status: "Open", changedAt: "2026-11-14T18:00:00Z", reason: null }],
    })} onPhotoError={vi.fn()} />);
    const delivered = screen.getByRole("heading", { name: "Delivery" });
    const history = screen.getByRole("heading", { name: "History" });
    expect(delivered.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("does not expose history or linked request IDs to a non-owner", () => {
    render(<ResidentRequestView request={detail({ viewer: "volunteer",
        statusHistory: [{ status: "Cancelled", changedAt: "2026-11-16T18:00:00Z", reason: "Private reason." }],
        rescheduledFrom: { requestId: "private-request" },
    })} onPhotoError={vi.fn()} />);
    expect(screen.queryByText("Private reason.")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Rescheduled from an earlier request" })).not.toBeInTheDocument();
});

it("loads the requested ID through the shared detail hook and shows the owner fields", async () => {
    renderWithClient(<ResidentRequestDetail requestId="r/1" />);
    expect(await screen.findByRole("heading", { name: "2 × Computers/Laptops" })).toBeInTheDocument();
    expect(api.getWithMeta).toHaveBeenCalledWith("/api/requests/r%2F1");
    expect(screen.getByText("5.00 kg")).toBeInTheDocument();
        expect(screen.getByText("101 Example Street SW")).toBeInTheDocument();
    expect(screen.getByText("Calgary, T2P 1J9")).toBeInTheDocument();
    expect(screen.getByText(/Use the side entrance/)).toHaveTextContent("Please ring the bell.");
    expect(within(screen.getByRole("region", { name: "Summary" })).getByText(formatWindow(detail().windows[0]))).toBeInTheDocument();
    expect(screen.getByText(formatTimestamp(detail().createdAt))).toBeInTheDocument();
    expect(screen.getByText("Windows and times are Calgary time.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to my requests" })).toHaveAttribute("href", "/resident");
});

it("shows loading without stale details while waiting for the first response", async () => {
    let resolve!: (value: ReturnType<typeof response>) => void;
    vi.mocked(api.getWithMeta).mockReturnValueOnce(new Promise(done => { resolve = done; }));
    renderWithClient(<ResidentRequestDetail requestId="r1" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading your request...");
    expect(screen.queryByText("101 Example Street SW")).not.toBeInTheDocument();
    await act(async () => resolve(response()));
    await screen.findByRole("heading", { name: "2 × Computers/Laptops" });
});

it.each(["Open", "Assigned", "Collected", "Delivered", "Cancelled", "Expired", "Missed"] as const)(
    "shows the %s status and its resident next-step sentence", status => {
        render(<ResidentRequestView request={detail({ status, allowedActions: [] })} onPhotoError={vi.fn()} />);
        const panel = within(screen.getByRole("region", { name: "Request status" }));
        expect(panel.getByText(status, { selector: "span" })).toBeInTheDocument();
        expect(panel.getByText(nextStepText(status, "resident"))).toBeInTheDocument();
        const progress = panel.queryByRole("list", { name: "Request progress" });
        if (status === "Cancelled" || status === "Expired" || status === "Missed") {
            expect(progress).not.toBeInTheDocument();
            expect(panel.queryByText(/^(Pickup windows offered|Open until|Volunteer|Facility)/)).not.toBeInTheDocument();
        } else {
            expect(progress).toBeInTheDocument();
            expect(within(progress!).getByText(`${status} (now)`)).toHaveAttribute("aria-current", "step");
        }
        // The panel says "Open until", so the Summary card no longer repeats it as "Expires"
        expect(screen.queryByText(/^Expires/)).not.toBeInTheDocument();
    },
);

it("shows the volunteer's public profile and selected window", () => {
    render(<ResidentRequestView request={detail({ status: "Assigned", assignment })} onPhotoError={vi.fn()} />);
    const panel = within(screen.getByRole("region", { name: "Request status" }));
    expect(panel.getByRole("link", { name: "Maya B." })).toHaveAttribute("href", "/profiles/maya");
    expect(panel.getByText(friendlyWindow(assignment.window))).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Selected pickup window" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Delivery" })).not.toBeInTheDocument();
});

it.each([
    ["Open", ["edit", "cancel"], ["Edit", "Cancel request"]],
    ["Assigned", ["cancel_assignment", "confirm_collected"], ["Cancel assignment", "Confirm collected"]],
    ["Assigned", ["confirm_collected", "report_missed"], ["Confirm collected", "Report missed pickup"]],
    ["Delivered", [], []],
] as const)("renders only supplied actions allowed by the server for %s", (status, allowedActions, names) => {
    render(<ResidentRequestView request={detail({ status, allowedActions: [...allowedActions] })}
        onPhotoError={vi.fn()} actionRenderers={actionRenderers} />);
    expect(screen.queryAllByRole("button").map(button => button.textContent)).toEqual([...names]);
    if (allowedActions.some(action => action === "report_missed")) {
        expect(screen.getByText("Your action is needed: confirm the collection or report a missed pickup.")).toBeInTheDocument();
    } else {
        expect(screen.queryByText(/Your action is needed/)).not.toBeInTheDocument();
    }
});

it("ignores unsupported actions and has no empty actions section", () => {
    render(<ResidentRequestView request={detail({ allowedActions: ["accept", "record_delivery", "future_action"] as RequestDetail["allowedActions"] })}
        onPhotoError={vi.fn()} actionRenderers={actionRenderers} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Request actions" })).not.toBeInTheDocument();
});

it("omits actions without a supplied control", () => {
    render(<ResidentRequestView request={detail()} onPhotoError={vi.fn()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("shows the delivery facility, Calgary time and evidence photo", () => {
    render(<ResidentRequestView request={detail({ status: "Delivered", allowedActions: [], assignment: {
        ...assignment, status: "Delivered", collectedAt: "2026-11-20T19:00:00Z", endedAt: delivery.deliveredAt, endReason: "Delivered",
    }, delivery, photoUrl: "https://images.example.test/item.jpg" })} onPhotoError={vi.fn()} />);
    const panel = within(screen.getByRole("region", { name: "Request status" }));
    expect(panel.getByText("Sample electronics depot")).toBeInTheDocument();
    expect(panel.getByText(formatTimestamp(delivery.deliveredAt))).toHaveAttribute("datetime", delivery.deliveredAt);
    expect(screen.getByText(`Delivered ${formatTimestamp(delivery.deliveredAt)}`)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Delivery photo" })).toHaveAttribute("src", delivery.evidencePhotoUrl);
    expect(screen.getByRole("img", { name: "Photo of the items" })).toHaveAttribute("src", "https://images.example.test/item.jpg");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("shows offered windows and expiration above the Open request actions", () => {
    const request = detail();
    render(<ResidentRequestView request={request} onPhotoError={vi.fn()} actionRenderers={actionRenderers} />);
    const panel = within(screen.getByRole("region", { name: "Request status" }));
    expect(panel.getByText("Pickup windows offered")).toBeInTheDocument();
    expect(panel.getByText(formatWindow(request.windows[0]))).toBeInTheDocument();
    const expires = panel.getByText(formatTimestamp(request.expiresAt));
    expect(expires).toHaveAttribute("datetime", request.expiresAt);
    expect(expires.compareDocumentPosition(panel.getByRole("button", { name: "Edit" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("puts the collection facts and notices before the actions", () => {
    const collectedAt = "2026-11-20T19:00:00Z";
    render(<ResidentRequestView request={detail({ status: "Collected", assignment: { ...assignment, collectedAt },
        allowedActions: ["report_missed"] })} onPhotoError={vi.fn()} actionRenderers={actionRenderers}
        notice={{ kind: "success", text: "Request updated." }} />);
    const panel = within(screen.getByRole("region", { name: "Request status" }));
    const action = panel.getByRole("button", { name: "Report missed pickup" });
    for (const item of [panel.getByRole("link", { name: "Maya B." }), panel.getByText(formatTimestamp(collectedAt)),
        panel.getByText("Request updated."), panel.getByText(/Your action is needed/)]) {
        expect(item.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
});

it.each(["Photo of the items", "Delivery photo"])("refetches once and gives a text fallback when %s fails", name => {
    const refetch = vi.fn();
    render(<ResidentRequestView request={detail({ photoUrl: "https://images.example.test/item.jpg", delivery })} onPhotoError={refetch} />);
    fireEvent.error(screen.getByRole("img", { name }));
    expect(refetch).toHaveBeenCalledOnce();
    fireEvent.error(screen.getByRole("img", { name }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(screen.queryByRole("img", { name })).not.toBeInTheDocument();
    expect(screen.getByText("The photo is not available right now.")).toBeInTheDocument();
});

it("omits absent notes, photos, address and assignment sections", () => {
    render(<ResidentRequestView request={detail({ notes: null, address: undefined })} onPhotoError={vi.fn()} />);
    for (const name of ["Photo", "Pickup address and notes", "Volunteer", "Delivery"]) {
        expect(screen.queryByRole("heading", { name })).not.toBeInTheDocument();
    }
});

it.each(["volunteer", "assigned_volunteer"] as const)("does not show owner details for viewer %s", async viewer => {
    vi.mocked(api.getWithMeta).mockResolvedValue(response(detail({ viewer })));
    renderWithClient(<ResidentRequestDetail requestId="r1" actionRenderers={actionRenderers} />);
    expect(await screen.findByRole("heading", { name: "This request is no longer available." })).toBeInTheDocument();
    expect(screen.queryByText("101 Example Street SW")).not.toBeInTheDocument();
    expect(screen.queryByText(/Use the side entrance/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("clears cached owner details and actions when a refresh returns request_unavailable", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><ResidentRequestDetail requestId="r1" actionRenderers={actionRenderers} /></QueryClientProvider>);
    await screen.findByRole("button", { name: "Edit" });
    vi.mocked(api.getWithMeta).mockRejectedValue(new ApiError(404, { error: { code: "request_unavailable", message: "Not available" } }));
    await act(async () => { await client.invalidateQueries({ queryKey: ["request", "r1"] }); });
    await screen.findByRole("heading", { name: "This request is no longer available." });
    expect(screen.queryByText("101 Example Street SW")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    cleanup(); client.clear();
});

it("replaces the actions and shows the warning when the server allows reporting a missed pickup", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(api.getWithMeta).mockResolvedValueOnce(response(detail({ status: "Assigned", assignment,
        allowedActions: ["cancel_assignment", "confirm_collected"],
    }))).mockResolvedValue(response(detail({ status: "Assigned", assignment,
        allowedActions: ["confirm_collected", "report_missed"],
    })));
    render(<QueryClientProvider client={client}><ResidentRequestDetail requestId="r1" actionRenderers={actionRenderers} /></QueryClientProvider>);
    await screen.findByRole("button", { name: "Cancel assignment" });
    expect(screen.queryByText(/Your action is needed/)).not.toBeInTheDocument();
    await act(async () => { await client.invalidateQueries({ queryKey: ["request", "r1"] }); });
    await screen.findByRole("button", { name: "Report missed pickup" });
    expect(screen.queryByRole("button", { name: "Cancel assignment" })).not.toBeInTheDocument();
    expect(screen.getByText("Your action is needed: confirm the collection or report a missed pickup.")).toBeInTheDocument();
    cleanup(); client.clear();
});

it("allows a failed request to be retried", async () => {
    vi.mocked(api.getWithMeta).mockRejectedValueOnce(new Error("Offline"));
    renderWithClient(<ResidentRequestDetail requestId="r1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not load your request.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { name: "2 × Computers/Laptops" });
    await waitFor(() => expect(api.getWithMeta).toHaveBeenCalledTimes(2));
});

it("shows an authorization error without offering a retry", async () => {
    vi.mocked(api.getWithMeta).mockRejectedValue(new ApiError(403, { error: { code: "forbidden", message: "Not allowed" } }));
    renderWithClient(<ResidentRequestDetail requestId="r1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Please log in again as a resident.");
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
});

it("links Edit request to the edit page when the request can be edited", async () => {
    renderWithClient(<ResidentRequestDetail requestId="r1" />);
    expect(await screen.findByRole("link", { name: "Edit request" })).toHaveAttribute("href", "/resident/requests/r1/edit");
    cleanup();
    vi.mocked(api.getWithMeta).mockResolvedValue(response(detail({ allowedActions: ["cancel"] })));
    renderWithClient(<ResidentRequestDetail requestId="r1" />);
    await screen.findByRole("button", { name: "Cancel request" });
    expect(screen.queryByRole("link", { name: "Edit request" })).not.toBeInTheDocument();
});

it("shows the missed pickup message after a reschedule", async () => {
    vi.mocked(api.getWithMeta).mockResolvedValue({ data: detail(), serverDate: new Date() } as never);
    renderWithClient(<ResidentRequestDetail requestId="r1" rescheduled />);
    expect(await screen.findByText("Missed pickup reported. Your new request is open.")).toBeInTheDocument();
});

it("groups the details, windows, address, notes and photo in one Summary card", () => {
    render(<ResidentRequestView request={detail({ photoUrl: "https://images.example.test/item.jpg" })} onPhotoError={vi.fn()} />);
    const summary = within(screen.getByRole("region", { name: "Summary" }));
    expect(summary.getByText("5.00 kg")).toBeInTheDocument();
    expect(summary.getByText(formatWindow(detail().windows[0]))).toBeInTheDocument();
    expect(summary.getByText("101 Example Street SW")).toBeInTheDocument();
    expect(summary.getByText(/Use the side entrance/)).toBeInTheDocument();
    expect(summary.getByRole("img", { name: "Photo of the items" })).toBeInTheDocument();
});

it("keeps Volunteer and Delivery as their own cards, before the summary for phones", () => {
    render(<ResidentRequestView request={detail({ status: "Delivered", allowedActions: [], assignment, delivery })} onPhotoError={vi.fn()} />);
    const summary = screen.getByRole("region", { name: "Summary" });
    for (const name of ["Volunteer", "Delivery"]) {
        const card = screen.getByRole("region", { name });
        expect(summary).not.toContainElement(card);
        expect(card.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(summary).toHaveClass("lg:row-start-1");
});

it("shows the unavailable page and no details to anyone who is not the owner", () => {
    render(<ResidentRequestView request={detail({ viewer: "assigned_volunteer" })} onPhotoError={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "This request is no longer available." })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Summary" })).not.toBeInTheDocument();
    expect(screen.queryByText("101 Example Street SW")).not.toBeInTheDocument();
});

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { RequestDetail } from "@/lib/types";
import { queryKeys } from "@/lib/query-keys";
import CancelRequest from "./cancel-request";
import ResidentRequestDetail from "./request-detail";

vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("firebase/auth", () => ({ signOut: vi.fn() }));
HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };

const detail = (patch: Partial<RequestDetail> = {}): RequestDetail => ({
    requestId: "r/1", viewer: "owner", status: "Open", allowedActions: ["cancel"],
    category: { categoryId: "laptops", name: "Computers/Laptops", wasteType: "Computers" },
    quantity: 1, estimatedWeightKg: 2.5, postalCode: "T2P1J9",
    createdAt: "2026-11-14T18:00:00Z", expiresAt: "2026-11-20T18:00:00Z",
    windows: [{ windowId: "w1", date: "2026-11-20", startHour: 14 }],
    assignment: null, delivery: null, refreshAt: null, ...patch,
});
let client: QueryClient;
const onNotice = vi.fn();
function mount(node = <CancelRequest request={detail()} onNotice={onNotice} />) {
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
function open() { fireEvent.click(screen.getByRole("button", { name: "Cancel request" })); }
function confirm() { fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel request" })); }

beforeEach(() => {
    onNotice.mockReset();
    vi.spyOn(api, "post").mockResolvedValue(detail({ status: "Cancelled", allowedActions: [] }));
    vi.spyOn(api, "getWithMeta").mockResolvedValue({ data: detail(), serverDate: new Date() });
});
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); });

it.each([
    detail({ allowedActions: [] }),
    detail({ viewer: "volunteer" }),
    detail({ viewer: "assigned_volunteer" }),
])("hides cancellation when the viewer or allowed actions prohibit it", request => {
    mount(<CancelRequest request={request} onNotice={onNotice} />);
    expect(screen.queryByRole("button", { name: "Cancel request" })).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
});

it("dismissing the dialog sends nothing and reopening starts with an empty reason", () => {
    mount(); open();
    fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: "Plans changed" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Keep request" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
    open(); expect(screen.getByLabelText("Reason (optional)")).toHaveValue("");
});

it.each([["  Plans changed  ", { reason: "Plans changed" }], ["   ", {}]])("posts the optional reason and invalidates affected lists", async (reason, body) => {
    mount(); const invalidate = vi.spyOn(client, "invalidateQueries"); open();
    fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: reason } });
    confirm();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.post).toHaveBeenCalledExactlyOnceWith("/api/requests/r%2F1/cancel", body);
    for (const key of [queryKeys.request("r/1"), queryKeys.myRequests, queryKeys.availableRequests, queryKeys.volunteerRequests, queryKeys.ecopoints]) {
        expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
    }
});

it("sends once and prevents editing or closing while the call is pending", async () => {
    let finish!: () => void;
    vi.mocked(api.post).mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }) as never);
    mount(); open();
    const button = within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel request" });
    fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Cancelling..." })).toBeDisabled();
    expect(screen.getByLabelText("Reason (optional)")).toBeDisabled();
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true, cancelable: true }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await act(async () => finish());
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("retries a network failure with the entered reason", async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new TypeError("offline"));
    mount(); open();
    fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: "No longer needed" } });
    confirm(); await screen.findByText(/We could not reach the server/);
    expect(screen.getByLabelText("Reason (optional)")).toHaveValue("No longer needed");
    confirm();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.post).toHaveBeenCalledTimes(2);
});

it("refreshes the page after success, shows Cancelled and removes the button", async () => {
    let current = detail();
    vi.mocked(api.getWithMeta).mockImplementation(async () => ({ data: current, serverDate: new Date() }) as never);
    vi.mocked(api.post).mockImplementation(async () => { current = detail({ status: "Cancelled", allowedActions: [] }); return current as never; });
    mount(<ResidentRequestDetail requestId="r/1" />);
    await screen.findByRole("button", { name: "Cancel request" }); open(); confirm();
    await screen.findByText("Cancelled");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Cancel request" })).not.toBeInTheDocument();
    expect(api.getWithMeta).toHaveBeenCalledTimes(2);
});

it.each([
    ["expired", "This request has expired.", "Expired"],
    ["not_cancellable", "This request can't be cancelled now.", "Collected"],
] as const)("keeps the %s message on the page when the refetch removes the button", async (code, message, status) => {
    let current = detail();
    vi.mocked(api.getWithMeta).mockImplementation(async () => ({ data: current, serverDate: new Date() }) as never);
    vi.mocked(api.post).mockImplementation(async () => {
        current = detail({ status, allowedActions: [] });
        throw new ApiError(409, { error: { code, message: "Server conflict" } });
    });
    mount(<ResidentRequestDetail requestId="r/1" />);
    await screen.findByRole("button", { name: "Cancel request" }); open(); confirm();
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    await screen.findByText(status);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Cancel request" })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(message);
});

it("shows the success alert Request cancelled. at the top of the page", async () => {
    let current = detail();
    vi.mocked(api.getWithMeta).mockImplementation(async () => ({ data: current, serverDate: new Date() }) as never);
    vi.mocked(api.post).mockImplementation(async () => { current = detail({ status: "Cancelled", allowedActions: [] }); return current as never; });
    mount(<ResidentRequestDetail requestId="r/1" />);
    await screen.findByRole("button", { name: "Cancel request" });
    expect(screen.queryByText("Request cancelled.")).not.toBeInTheDocument();
    open(); confirm();
    expect(await screen.findByText("Request cancelled.")).toBeInTheDocument();
    await screen.findByText("Cancelled");
    expect(screen.getByText("Request cancelled.").closest("[role=status]")).not.toBeNull();
});

it("tells the page about the result, and clears an old one when the dialog opens again", async () => {
    mount(); open(); confirm();
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith({ kind: "success", text: "Request cancelled." }));
    cleanup();
    onNotice.mockClear();
    mount(); open();
    expect(onNotice).toHaveBeenCalledWith(null);
});

it.each([
    ["Open", "Volunteers will no longer see it."],
    ["Assigned", "The volunteer will be told, and the request will be cancelled."],
] as const)("explains what cancelling a %s request does", (status, sentence) => {
    mount(<CancelRequest request={detail({ status })} onNotice={onNotice} />); open();
    expect(within(screen.getByRole("dialog")).getByText(sentence)).toBeInTheDocument();
});

it("names the buttons Keep request and Cancel request in the dialog, and shows the page button as a red outline", () => {
    mount();
    expect(screen.getByRole("button", { name: "Cancel request" })).toHaveClass("border-danger", "text-danger");
    open();
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByRole("button", { name: "Keep request" })).toBeInTheDocument();
    expect(dialog.getByRole("button", { name: "Cancel request" })).toHaveClass("bg-danger");
    expect(dialog.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
});

it("puts the cancel button in the same group as the other actions", async () => {
    vi.mocked(api.getWithMeta).mockResolvedValue({ data: detail({ allowedActions: ["edit", "cancel"] }), serverDate: new Date() } as never);
    mount(<ResidentRequestDetail requestId="r/1" actionRenderers={{ edit: () => <button>Edit request</button> }} />);
    const group = await screen.findByRole("region", { name: "Request actions" });
    expect(within(group).getAllByRole("button").map(button => button.textContent)).toEqual(["Edit request", "Cancel request"]);
});

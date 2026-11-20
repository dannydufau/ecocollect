import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { RequestDetail } from "@/lib/types";
import { renderWithClient } from "@/test/utils";
import AcceptRequest from "./accept-request";

vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("firebase/auth", () => ({ signOut: vi.fn() }));
HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };

const request: RequestDetail = {
    requestId: "r1", status: "Open", viewer: "volunteer",
    category: { categoryId: "laptops", name: "Computers/Laptops", wasteType: "Computers" },
    quantity: 2, estimatedWeightKg: 5, postalCode: "T2P1J9",
    createdAt: "2026-11-14T18:00:00Z", expiresAt: "2026-11-20T18:00:00Z",
    windows: [{ windowId: "w1", date: "2026-11-20", startHour: 11 }, { windowId: "w2", date: "2026-11-21", startHour: 14 }],
    allowedActions: ["accept"], refreshAt: null,
};
const termsBox = "I have read and accept the terms and safety guidelines";
const conflict = (code: string) => new ApiError(409, { error: { code, message: code } });

let invalidate: ReturnType<typeof vi.spyOn>;

async function openDialog(detail = request) {
    renderWithClient(<AcceptRequest request={detail} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept request" }));
    const dialog = screen.getByRole("dialog");
    await within(dialog).findByLabelText(termsBox);
    return dialog;
}
function confirmButton(dialog: HTMLElement) {
    return within(dialog).getByRole("button", { name: "Accept" });
}
async function fill(dialog: HTMLElement) {
    fireEvent.click(within(dialog).getByRole("radio", { name: /Sat, Nov 21, 14:00 to 15:00/ }));
    fireEvent.click(within(dialog).getByLabelText(termsBox));
    fireEvent.click(confirmButton(dialog));
}

beforeEach(() => {
    vi.spyOn(api, "get").mockResolvedValue({ termsDocumentId: "terms_3", content: "Some terms", publishedAt: "2026-11-01T00:00:00Z" });
    vi.spyOn(api, "post").mockResolvedValue(request);
    invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("keeps Confirm disabled until a window and the terms are chosen", async () => {
    const dialog = await openDialog();
    expect(confirmButton(dialog)).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("radio", { name: /Sat, Nov 21/ }));
    expect(confirmButton(dialog)).toBeDisabled();
    fireEvent.click(within(dialog).getByLabelText(termsBox));
    expect(confirmButton(dialog)).toBeEnabled();
});

it("shows each window with its friendly and full text and preselects a single window", async () => {
    const dialog = await openDialog({ ...request, windows: [request.windows[0]] });
    const radio = within(dialog).getByRole("radio");
    expect(radio).toBeChecked();
    expect(radio.closest("label")).toHaveTextContent("Fri, Nov 20, 11:00 to 12:00");
    fireEvent.click(within(dialog).getByLabelText(termsBox));
    expect(confirmButton(dialog)).toBeEnabled();
});

it("posts the window and the terms id, then refreshes the lists and closes", async () => {
    const dialog = await openDialog();
    await fill(dialog);
    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
    expect(api.post).toHaveBeenCalledWith("/api/requests/r1/assignment", { windowId: "w2", termsDocumentId: "terms_3" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["request", "r1"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["requests", "available"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["requests", "volunteer"] });
});

it("says another volunteer was first and refetches the request", async () => {
    vi.mocked(api.post).mockRejectedValue(conflict("already_assigned"));
    const dialog = await openDialog();
    await fill(dialog);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Another volunteer accepted this request first.");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["request", "r1"] });
    expect(dialog).toHaveAttribute("open");
});

it.each([
    ["expired", "This request has expired."],
    ["not_open", "This request is no longer open"],
    ["terms_outdated", "The terms have changed. Please read and accept them again."],
])("shows the message for %s", async (code, text) => {
    vi.mocked(api.post).mockRejectedValue(conflict(code));
    const dialog = await openDialog();
    await fill(dialog);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(text);
});

it("reloads the terms when they are outdated", async () => {
    vi.mocked(api.post).mockRejectedValue(conflict("terms_outdated"));
    const dialog = await openDialog();
    await fill(dialog);
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ["terms"] }));
});

it("sends nothing when the dialog is cancelled", async () => {
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(dialog).not.toHaveAttribute("open");
    expect(api.post).not.toHaveBeenCalled();
});

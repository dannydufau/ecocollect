import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { RequestDetail } from "@/lib/types";
import { renderWithClient } from "@/test/utils";
import RecordDelivery from "./record-delivery";

vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("firebase/auth", () => ({ signOut: vi.fn() }));
// The pickers have their own tests, here they only hand back an id
vi.mock("./facility-picker", () => ({
    FacilityPicker: ({ categoryId, onChange }: { categoryId: string; onChange: (id: string) => void }) =>
        <button type="button" onClick={() => onChange("f1")}>Pick facility for {categoryId}</button>,
}));
vi.mock("@/components/photo-picker", () => ({
    default: ({ purpose, requestId, onUploaded }: { purpose: string; requestId: string; onUploaded: (id: string) => void }) =>
        <button type="button" onClick={() => onUploaded("file-9")}>Upload {purpose} for {requestId}</button>,
}));
HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };

const request: RequestDetail = {
    requestId: "r1", status: "Collected", viewer: "assigned_volunteer",
    category: { categoryId: "laptops", name: "Computers/Laptops", wasteType: "Computers" },
    quantity: 2, estimatedWeightKg: 5, postalCode: "T2P1J9",
    createdAt: "2026-11-14T18:00:00Z", expiresAt: "2026-11-20T18:00:00Z",
    windows: [{ windowId: "w1", date: "2026-11-20", startHour: 11 }],
    allowedActions: ["record_delivery"], refreshAt: null,
};

let invalidate: ReturnType<typeof vi.spyOn>;
const onDone = vi.fn();

function openDialog() {
    renderWithClient(<RecordDelivery request={request} onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "Record delivery" }));
    return screen.getByRole("dialog");
}
const confirmButton = (dialog: HTMLElement) => within(dialog).getByRole("button", { name: "Record delivery" });
function fill(dialog: HTMLElement) {
    fireEvent.click(within(dialog).getByRole("button", { name: "Pick facility for laptops" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload delivery_evidence for r1" }));
    fireEvent.click(confirmButton(dialog));
}

beforeEach(() => {
    vi.spyOn(api, "post").mockResolvedValue(request);
    invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); onDone.mockReset(); });

it("keeps Confirm disabled until a facility and a photo are set", () => {
    const dialog = openDialog();
    expect(confirmButton(dialog)).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Pick facility for laptops" }));
    expect(confirmButton(dialog)).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload delivery_evidence for r1" }));
    expect(confirmButton(dialog)).toBeEnabled();
});

it("posts the facility and the photo id, then refreshes the request, history and EcoPoints", async () => {
    const dialog = openDialog();
    fill(dialog);
    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
    expect(api.post).toHaveBeenCalledWith("/api/requests/r1/assignment/delivery", { facilityId: "f1", evidencePhoto: { fileId: "file-9" } });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["request", "r1"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["requests", "volunteer"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["ecopoints"] });
    expect(onDone).toHaveBeenCalledWith("Delivery recorded. EcoPoints are on their way.");
});

it("explains who can see the delivery photo", () => {
    const dialog = openDialog();
    expect(within(dialog).getByRole("heading", { name: "Record delivery" })).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Add a photo of the items at the facility. Only you and the resident can see it.");
});

it("shows the server message for a 400 and keeps the form open", async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError(400, { error: { code: "validation_error", message: "This facility does not accept laptops." } }));
    const dialog = openDialog();
    fill(dialog);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("This facility does not accept laptops.");
    expect(dialog).toHaveAttribute("open");
});

it.each([
    ["already_delivered", "This delivery has already been recorded."],
    ["not_collected", "Confirm the collection before recording a delivery."],
])("refetches the request and shows the message for %s", async (code, text) => {
    vi.mocked(api.post).mockRejectedValue(new ApiError(409, { error: { code, message: code } }));
    const dialog = openDialog();
    fill(dialog);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(text);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["request", "r1"] });
});

it("uses the wide dialog", () => {
    expect(openDialog()).toHaveClass("max-w-xl");
});

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as apiModule from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import NewRequestForm from "./new-request-form";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("firebase/auth", () => ({ signOut: vi.fn() }));
// Hands back a file id like the real picker after an upload
vi.mock("@/components/photo-picker", async () => {
    const { useState } = await import("react");
    let count = 0;
    return {
        default: function PhotoPicker({ onUploaded, onClear }: { onUploaded: (fileId: string, previewUrl: string) => void; onClear: () => void }) {
            const [shown, setShown] = useState("");
            return <div>
                <button type="button" onClick={() => { const fileId = `f${++count}`; setShown(fileId); onUploaded(fileId, `blob:${fileId}`); }}>Upload photo</button>
                <button type="button" onClick={() => { setShown(""); onClear(); }}>Clear photo</button>
                {shown && <span>Preview {shown}</span>}
            </div>;
        },
    };
});
const categories = [
    { categoryId: "laptops", name: "Computers/Laptops", wasteType: "Computers", standardWeightKg: 2.5 },
    { categoryId: "phones", name: "Phones", wasteType: "Mobile Devices", standardWeightKg: 0.2 },
];
let termsId: string;
let client: QueryClient;
function mount() {
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    return render(<QueryClientProvider client={client}><NewRequestForm /></QueryClientProvider>);
}
async function fill() {
    fireEvent.change(await screen.findByLabelText("Category"), { target: { value: "laptops" } });
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Date 1"), { target: { value: "2026-11-21" } });
    fireEvent.change(screen.getByLabelText("Start hour 1"), { target: { value: "14" } });
}
async function accept() {
    if (screen.queryByRole("button", { name: "Review" })) fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /accept the terms/ }));
}
const button = () => screen.getByRole("button", { name: "Confirm and send" });
const failure = (status: number, code: string, fields?: Record<string, string>) => new apiModule.ApiError(status, { error: { code, message: "Check the request.", details: { fields } } });
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-20T18:00:00Z"));
    termsId = "t1"; push.mockReset();
    vi.spyOn(apiModule.api, "get").mockImplementation(async path => (path === "/api/categories" ? categories : path === "/api/profile" ? { address: { street: "123 Main Street", postalCode: "T2P1J9" } } : { termsDocumentId: termsId, content: `Terms ${termsId}`, publishedAt: "2026-11-01T18:00:00Z" }) as never);
    vi.spyOn(apiModule, "apiFetch").mockResolvedValue({ requests: [{ requestId: "r1" }] });
});
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); vi.useRealTimers(); });

it("requires current terms acceptance and sends nothing when the form is submitted without it", async () => {
    mount(); await fill(); fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(button()).toBeDisabled();
    fireEvent.submit(button().closest("form")!);
    expect(apiModule.apiFetch).not.toHaveBeenCalled();
    await accept(); expect(button()).toBeEnabled();
    await accept(); expect(button()).toBeDisabled();
});
it("posts the Q4 body with numeric quantities and an idempotency header, then refreshes the list and navigates", async () => {
    mount(); await fill();
    fireEvent.click(screen.getByRole("button", { name: "Add another item" }));
    fireEvent.change(screen.getAllByLabelText("Category")[1], { target: { value: "phones" } });
    fireEvent.change(screen.getByLabelText("Notes (optional)"), { target: { value: "Side door" } });
    await accept();
    vi.mocked(apiModule.apiFetch).mockResolvedValue({ requests: [{ requestId: "r1" }, { requestId: "r2" }] });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    fireEvent.click(button());
    await waitFor(() => expect(push).toHaveBeenCalledWith("/resident?created=2"));
    const [url, init] = vi.mocked(apiModule.apiFetch).mock.calls[0];
    expect(url).toBe("/api/requests"); expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(init!.body as string)).toEqual({ items: [{ categoryId: "laptops", quantity: 2 }, { categoryId: "phones", quantity: 1 }], windows: [{ date: "2026-11-21", startHour: 14 }], notes: "Side door", termsDocumentId: "t1" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["requests", "mine"] });
});
it("omits empty notes and photo fields", async () => {
    mount(); await fill(); await accept(); fireEvent.click(button());
    await waitFor(() => expect(push).toHaveBeenCalled());
    const body = JSON.parse(vi.mocked(apiModule.apiFetch).mock.calls[0][1]!.body as string);
    expect(body).not.toHaveProperty("notes"); expect(body.items[0]).not.toHaveProperty("photo");
});
it("prevents duplicate submissions and disables editing while sending", async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(apiModule.apiFetch).mockImplementation(() => new Promise(resolve => { finish = resolve; }) as never);
    mount(); await fill(); await accept();
    const form = button().closest("form")!;
    fireEvent.submit(form); fireEvent.submit(form);
    expect(apiModule.apiFetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Sending..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Back to edit" })).toBeDisabled();
    finish({ requests: [{ requestId: "r1" }] });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/resident?created=1"));
    fireEvent.submit(form); expect(apiModule.apiFetch).toHaveBeenCalledTimes(1);
});
it("reuses the idempotency key after a failed attempt", async () => {
    vi.mocked(apiModule.apiFetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const uuid = vi.spyOn(crypto, "randomUUID");
    mount(); await fill(); await accept(); fireEvent.click(button());
    await screen.findByText(/could not reach the server/);
    fireEvent.click(button());
    await waitFor(() => expect(push).toHaveBeenCalled());
    const calls = vi.mocked(apiModule.apiFetch).mock.calls;
    expect(new Headers(calls[0][1]?.headers).get("Idempotency-Key")).toBe(new Headers(calls[1][1]?.headers).get("Idempotency-Key"));
    expect(uuid).toHaveBeenCalledTimes(1);
});
it("uses a new idempotency key when the form was edited after a failed attempt", async () => {
    vi.mocked(apiModule.apiFetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    mount(); await fill(); await accept(); fireEvent.click(button());
    await screen.findByText(/could not reach the server/);
    fireEvent.click(screen.getByRole("button", { name: "Back to edit" }));
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "3" } });
    await accept();
    fireEvent.click(button());
    await waitFor(() => expect(push).toHaveBeenCalled());
    const calls = vi.mocked(apiModule.apiFetch).mock.calls;
    expect(new Headers(calls[0][1]?.headers).get("Idempotency-Key")).not.toBe(new Headers(calls[1][1]?.headers).get("Idempotency-Key"));
});
it("says why Send is disabled until the terms are accepted", async () => {
    mount(); await fill(); fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(button()).toHaveAccessibleDescription("Accept the terms above to send.");
    await accept();
    expect(screen.queryByText("Accept the terms above to send.")).not.toBeInTheDocument();
});
it("moves focus to the first field the server rejected", async () => {
    vi.mocked(apiModule.apiFetch).mockRejectedValueOnce(failure(400, "validation_error", { "items[0].quantity": "Choose a smaller quantity." }));
    mount(); await fill(); await accept(); fireEvent.click(button());
    await screen.findByText("Choose a smaller quantity.");
    await waitFor(() => expect(screen.getByLabelText("Quantity")).toHaveFocus());
});
it("shows a server quantity error on its row and clears it when edited", async () => {
    vi.mocked(apiModule.apiFetch).mockRejectedValueOnce(failure(400, "validation_error", { "items[0].quantity": "Choose a smaller quantity." }));
    mount(); await fill(); await accept(); fireEvent.click(button());
    await screen.findByText("Choose a smaller quantity.");
    expect(screen.getByLabelText("Quantity")).toHaveAccessibleDescription("Choose a smaller quantity.");
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "1" } });
    expect(screen.queryByText("Choose a smaller quantity.")).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
});
it("shows indexed window and notes field errors", async () => {
    vi.mocked(apiModule.apiFetch).mockRejectedValueOnce(failure(400, "validation_error", { "windows[0].date": "Choose another day.", notes: "Shorten the notes." }));
    mount(); await fill(); await accept(); fireEvent.click(button());
    await screen.findByText("Choose another day.");
    expect(screen.getByLabelText("Notes (optional)")).toHaveAccessibleDescription("Shorten the notes.");
});
it("reloads outdated terms and requires acceptance again before retrying", async () => {
    vi.mocked(apiModule.apiFetch).mockRejectedValueOnce(failure(409, "terms_outdated"));
    mount(); await fill(); await accept(); termsId = "t2"; fireEvent.click(button());
    await screen.findByText("Terms t2");
    expect(screen.getByRole("checkbox", { name: /accept the terms/ })).not.toBeChecked();
    expect(button()).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("The terms have changed.");
    await accept(); fireEvent.click(button());
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(JSON.parse(vi.mocked(apiModule.apiFetch).mock.calls[1][1]!.body as string).termsDocumentId).toBe("t2");
});
it("does not open review for invalid item details", async () => {
    mount(); await screen.findByLabelText("Category"); fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(apiModule.apiFetch).not.toHaveBeenCalled();
    expect(screen.getByText("Choose a category.")).toBeInTheDocument();
});
it("reviews the entered details and profile address without sending, then keeps them when going back", async () => {
    mount(); await fill();
    fireEvent.change(screen.getByLabelText("Notes (optional)"), { target: { value: "Side door" } });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(await screen.findByText("123 Main Street, T2P 1J9")).toBeInTheDocument();
    expect(screen.getByText("2 × Computers/Laptops")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Items" })).getByText(/^Estimated weight:/)).toHaveTextContent("Estimated weight: 5.00 kg");
    expect(screen.getByRole("region", { name: "Pickup windows" })).toHaveTextContent(/Nov 21/);
    expect(screen.getByRole("region", { name: "Notes" })).toHaveTextContent("Side door");
    expect(screen.getByRole("heading", { name: "Review your request" })).toHaveFocus();
    expect(apiModule.apiFetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back to edit" }));
    expect(screen.getByRole("button", { name: "Review" })).toHaveFocus();
    expect(screen.getByLabelText("Category")).toHaveValue("laptops");
    expect(screen.getByLabelText("Quantity")).toHaveValue(2);
    expect(screen.getByLabelText("Date 1")).toHaveValue("2026-11-21");
    expect(screen.getByLabelText("Start hour 1")).toHaveValue("14");
    expect(screen.getByLabelText("Notes (optional)")).toHaveValue("Side door");
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByText("3 × Computers/Laptops")).toBeInTheDocument();
    expect(apiModule.apiFetch).not.toHaveBeenCalled();
});
it("blocks confirmation when the profile address cannot be loaded and allows retry", async () => {
    const get = vi.mocked(apiModule.api.get);
    const fallback = get.getMockImplementation()!;
    get.mockImplementation(async path => { if (path === "/api/profile") throw new TypeError("Failed to fetch"); return fallback(path); });
    mount(); await fill(); await accept();
    await screen.findByText(/Could not load your address/);
    expect(button()).toBeDisabled();
    fireEvent.submit(button().closest("form")!);
    expect(apiModule.apiFetch).not.toHaveBeenCalled();
    get.mockImplementation(fallback);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("123 Main Street, T2P 1J9");
    expect(button()).toBeEnabled();
});
it("rechecks windows before confirmation if time has passed during review", async () => {
    mount(); await fill(); await accept();
    await screen.findByText("123 Main Street, T2P 1J9");
    vi.setSystemTime(new Date("2026-11-22T18:00:00Z"));
    fireEvent.click(button());
    expect(await screen.findByText("Choose pickup windows in the future.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review" })).toBeInTheDocument();
    expect(apiModule.apiFetch).not.toHaveBeenCalled();
});
it("requires renewed acceptance when a background refetch changes the terms", async () => {
    mount(); await fill(); await accept(); termsId = "t2";
    await client.invalidateQueries({ queryKey: queryKeys.terms });
    await screen.findByText("Terms t2");
    expect(button()).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /accept the terms/ })).not.toBeChecked();
});
it("says how many requests the items will create", async () => {
    mount(); await fill();
    fireEvent.click(screen.getByRole("button", { name: "Add another item" }));
    fireEvent.change(screen.getAllByLabelText("Category")[1], { target: { value: "phones" } });
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(await screen.findByText("This creates 2 separate requests, one per item.")).toBeInTheDocument();
    expect(screen.getByText("1 × Phones")).toBeInTheDocument();
});
it("shows the item thumbnail and sends only the uploaded file ID", async () => {
    mount(); await fill();
    fireEvent.click(screen.getByRole("button", { name: "Upload photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(await screen.findByRole("img", { name: "Photo of item" })).toHaveAttribute("src", expect.stringMatching(/^blob:f\d+$/));
    for (const name of ["Pickup windows", "Notes", "Pickup address"]) {
        expect(screen.getByRole("heading", { name, level: 2 })).toBeInTheDocument();
    }
    await accept();
    fireEvent.click(button());
    await waitFor(() => expect(apiModule.apiFetch).toHaveBeenCalled());
    const body = JSON.parse(vi.mocked(apiModule.apiFetch).mock.calls[0][1]!.body as string);
    expect(body.items).toEqual([{ categoryId: "laptops", quantity: 2, photo: { fileId: expect.stringMatching(/^f\d+$/) } }]);
});
it("leaves photo out of the item when nothing was uploaded", async () => {
    mount(); await fill(); await accept();
    fireEvent.click(button());
    await waitFor(() => expect(apiModule.apiFetch).toHaveBeenCalled());
    const body = JSON.parse(vi.mocked(apiModule.apiFetch).mock.calls[0][1]!.body as string);
    expect(body.items).toEqual([{ categoryId: "laptops", quantity: 2 }]);
    expect(screen.queryByRole("img", { name: "Photo of item" })).not.toBeInTheDocument();
});
it("keeps the review thumbnail across steps and clears it when the photo is removed", async () => {
    mount(); await fill();
    fireEvent.click(screen.getByRole("button", { name: "Upload photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    const thumbnail = await screen.findByRole("img", { name: "Photo of item" });
    const url = thumbnail.getAttribute("src");
    fireEvent.click(screen.getByRole("button", { name: "Back to edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(await screen.findByRole("img", { name: "Photo of item" })).toHaveAttribute("src", url);
    fireEvent.click(screen.getByRole("button", { name: "Back to edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.queryByRole("img", { name: "Photo of item" })).not.toBeInTheDocument();
});
it("shows the invalid_photo field error under the item's picker", async () => {
    vi.mocked(apiModule.apiFetch).mockRejectedValue(failure(400, "invalid_photo", { "items[0].photo": "This photo could not be used." }));
    mount(); await fill();
    fireEvent.click(screen.getByRole("button", { name: "Upload photo" }));
    await accept();
    fireEvent.click(button());
    const row = await screen.findByRole("group", { name: "Item 1" });
    await waitFor(() => expect(within(row).getByRole("alert")).toHaveTextContent("This photo could not be used."));
});
it("has one heading and the step indicator on each step", async () => {
    mount(); await fill();
    expect(screen.getAllByRole("heading", { level: 1 }).map(heading => heading.textContent)).toEqual(["New pickup request"]);
    expect(screen.getByText("Add the items you want collected. Each item becomes its own request.")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 2")).toHaveAttribute("aria-current", "step");
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(await screen.findByText("Step 2 of 2")).toHaveAttribute("aria-current", "step");
    expect(screen.getAllByRole("heading", { level: 1 }).map(heading => heading.textContent)).toEqual(["Review your request"]);
});
it("shows the profile address on step 1 and opens Change address in a new tab", async () => {
    mount();
    expect(await screen.findByText(/We collect from 123 Main Street, T2P 1J9\./)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Change address/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
});
it("shows the total weight on review only with two or more items", async () => {
    mount(); await fill();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    await screen.findByRole("heading", { name: "Review your request" });
    expect(screen.queryByText(/Total estimated weight/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Add another item" }));
    fireEvent.change(screen.getAllByLabelText("Category")[1], { target: { value: "phones" } });
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect((await screen.findByText(/Total estimated weight/)).querySelector("strong")).toHaveTextContent("5.20 kg");
});
it("fades step 2 in and still moves focus to its heading", async () => {
    mount(); await fill();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    const heading = await screen.findByRole("heading", { name: "Review your request" });
    expect(heading.closest(".fade-in")).not.toBeNull();
    expect(heading).toHaveFocus();
});

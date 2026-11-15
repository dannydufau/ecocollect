import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as apiModule from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import NewRequestForm from "./new-request-form";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("firebase/auth", () => ({ signOut: vi.fn() }));
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
    fireEvent.click(await screen.findByRole("checkbox", { name: /accept the terms/ }));
}
const button = () => screen.getByRole("button", { name: "Send request" });
const failure = (status: number, code: string, fields?: Record<string, string>) => new apiModule.ApiError(status, { error: { code, message: "Check the request.", details: { fields } } });
beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-20T18:00:00Z"));
    termsId = "t1"; push.mockReset();
    vi.spyOn(apiModule.api, "get").mockImplementation(async path => (path === "/api/categories" ? categories : { termsDocumentId: termsId, content: `Terms ${termsId}`, publishedAt: "2026-11-01T18:00:00Z" }) as never);
    vi.spyOn(apiModule, "apiFetch").mockResolvedValue({ requests: [{ requestId: "r1" }] });
});
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); vi.useRealTimers(); });

it("requires current terms acceptance and sends nothing when the form is submitted without it", async () => {
    mount(); await fill();
    expect(button()).toBeDisabled();
    fireEvent.submit(button().closest("form")!);
    expect(apiModule.apiFetch).not.toHaveBeenCalled();
    await accept(); expect(button()).toBeEnabled();
    await accept(); expect(button()).toBeDisabled();
});
it("posts the Q4 body with numeric quantities and an idempotency header, then refreshes the list and navigates", async () => {
    mount(); await fill(); await accept();
    fireEvent.click(screen.getByRole("button", { name: "Add another item" }));
    fireEvent.change(screen.getAllByLabelText("Category")[1], { target: { value: "phones" } });
    fireEvent.change(screen.getByLabelText("Notes (optional)"), { target: { value: "Side door" } });
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
    expect(screen.getByLabelText("Quantity")).toBeDisabled();
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
it("does not submit invalid item details even after accepting the terms", async () => {
    mount(); await screen.findByLabelText("Category"); await accept(); fireEvent.click(button());
    expect(apiModule.apiFetch).not.toHaveBeenCalled();
    expect(screen.getByText("Choose a category.")).toBeInTheDocument();
});
it("requires renewed acceptance when a background refetch changes the terms", async () => {
    mount(); await fill(); await accept(); termsId = "t2";
    await client.invalidateQueries({ queryKey: queryKeys.terms });
    await screen.findByText("Terms t2");
    expect(button()).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: /accept the terms/ })).not.toBeChecked();
});

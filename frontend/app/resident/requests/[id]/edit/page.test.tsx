import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { calgaryToday } from "@/lib/time";
import type { RequestDetail } from "@/lib/types";
import { pageWidth } from "@/components/ui";
import EditRequestPage from "./page";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "r1" }), useRouter: () => router }));
vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("firebase/auth", () => ({ signOut: vi.fn() }));
vi.mock("@/components/photo-picker", () => ({
    default: ({ onUploaded }: { onUploaded: (fileId: string) => void }) => <button type="button" onClick={() => onUploaded("f-new")}>Upload photo</button>,
}));

const categories = [
    { categoryId: "laptops", name: "Computers/Laptops", wasteType: "Computers", standardWeightKg: 2.5 },
    { categoryId: "phones", name: "Phones", wasteType: "Mobile Devices", standardWeightKg: 0.2 },
];
// Window rules check against the real clock, so the dates move with it
const day = (days: number) => calgaryToday(new Date(Date.now() + days * 86_400_000));
const detail = (patch: Partial<RequestDetail> = {}): RequestDetail => ({
    requestId: "r1", status: "Open", viewer: "owner",
    category: { categoryId: "laptops", name: "Computers/Laptops", wasteType: "Computers" },
    quantity: 2, estimatedWeightKg: 5, postalCode: "T2P1J9",
    createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    windows: [{ windowId: "w1", date: day(2), startHour: 14 }, { windowId: "w2", date: day(1), startHour: 10 }],
    notes: "Side door", photoUrl: "https://images.example.test/item.jpg",
    allowedActions: ["edit", "cancel"], refreshAt: null, ...patch,
});
let client: QueryClient;
let current: RequestDetail;

function mount() {
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><EditRequestPage /></QueryClientProvider>);
    return screen.findByLabelText("Quantity");
}
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

beforeEach(() => {
    current = detail();
    router.push.mockReset();
    router.replace.mockReset();
    vi.spyOn(api, "getWithMeta").mockImplementation(async () => ({ data: current, serverDate: new Date() }) as never);
    vi.spyOn(api, "get").mockResolvedValue(categories);
    vi.spyOn(api, "patch").mockImplementation(async () => current as never);
});
afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); });

it("prefills the form from the request in single item mode", async () => {
    expect(await mount()).toHaveValue(2);
    await waitFor(() => expect(screen.getByLabelText("Category")).toHaveValue("laptops"));
    expect(screen.getByLabelText("Notes (optional)")).toHaveValue("Side door");
    expect(screen.getByLabelText("Date 1")).toHaveValue(day(2));
    expect(screen.getByLabelText("Date 2")).toHaveValue(day(1));
    expect(screen.getByRole("img", { name: "Photo of the items" })).toHaveAttribute("src", current.photoUrl);
    expect(screen.queryByRole("button", { name: "Add another item" })).not.toBeInTheDocument();
});

it("keeps the form in a narrow column at the left of the page width", async () => {
    await mount();
    const main = screen.getByRole("main");
    expect(main).toHaveClass(...pageWidth.split(" "));
    expect(main.firstElementChild).toHaveClass("max-w-3xl");
    expect(main.firstElementChild).not.toHaveClass("mx-auto");
});

it("sends only the quantity when only that changed, then goes back to the request", async () => {
    fireEvent.change(await mount(), { target: { value: "3" } });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    save();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/resident/requests/r1"));
    expect(api.patch).toHaveBeenCalledExactlyOnceWith("/api/requests/r1", { quantity: 3 });
    for (const key of [queryKeys.request("r1"), queryKeys.myRequests, queryKeys.availableRequests]) expect(invalidate).toHaveBeenCalledWith({ queryKey: key });
});

it("sends photo null when the photo is removed", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    save();
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/requests/r1", { photo: null }));
});

it("sends the new photo after it was replaced", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Replace photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Upload photo" }));
    save();
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/requests/r1", { photo: { fileId: "f-new" } }));
});

it("sends nothing and says so when nothing changed", async () => {
    await mount();
    save();
    expect(await screen.findByText("Nothing changed, so there is nothing to save.")).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
});

it("shows not_open and refetches the request", async () => {
    vi.mocked(api.patch).mockImplementation(async () => {
        current = detail({ status: "Assigned", allowedActions: [] });
        throw new ApiError(409, { error: { code: "not_open", message: "not open" } });
    });
    fireEvent.change(await mount(), { target: { value: "3" } });
    save();
    expect(await screen.findByText("This request is no longer open, so it can't be changed.")).toBeInTheDocument();
    expect(await screen.findByText("This request can't be edited now.")).toBeInTheDocument();
    expect(api.getWithMeta).toHaveBeenCalledTimes(2);
});

it("shows a message and a link back instead of the form when the request can't be edited", async () => {
    current = detail({ allowedActions: ["cancel"] });
    render(<QueryClientProvider client={client = new QueryClient()}><EditRequestPage /></QueryClientProvider>);
    expect(await screen.findByText("This request can't be edited now.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to request" })).toHaveAttribute("href", "/resident/requests/r1");
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
});

it("says the address can't be changed and cancels back to the request", async () => {
    await mount();
    expect(screen.getByText("The pickup address comes from your profile and can't be changed here.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/resident/requests/r1");
});

it("Keep current photo undoes a replace, shows the saved photo and sends no photo", async () => {
    fireEvent.change(await mount(), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Replace photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Upload photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep current photo" }));
    expect(screen.getByRole("img", { name: "Photo of the items" })).toHaveAttribute("src", current.photoUrl);
    expect(screen.queryByRole("button", { name: "Keep current photo" })).not.toBeInTheDocument();
    save();
    await waitFor(() => expect(api.patch).toHaveBeenCalledExactlyOnceWith("/api/requests/r1", { quantity: 3 }));
});

it("Keep current photo with nothing else changed sends nothing", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Replace photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Upload photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep current photo" }));
    save();
    expect(await screen.findByText("Nothing changed, so there is nothing to save.")).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
});

it("Keep current photo also undoes a removal", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep current photo" }));
    expect(screen.getByRole("img", { name: "Photo of the items" })).toBeInTheDocument();
});

it("shows one EmptyState with a back button when the request can't be edited", async () => {
    current = detail({ allowedActions: ["cancel"] });
    render(<QueryClientProvider client={client = new QueryClient()}><EditRequestPage /></QueryClientProvider>);
    const title = await screen.findByText("This request can't be edited now.");
    expect(title.parentElement).toContainElement(screen.getByRole("link", { name: "Back to request" }));
    expect(screen.getAllByRole("link", { name: "Back to request" })).toHaveLength(1);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("shows the same EmptyState when the request is gone", async () => {
    vi.mocked(api.getWithMeta).mockRejectedValue(new ApiError(404, { error: { code: "request_unavailable", message: "gone" } }));
    render(<QueryClientProvider client={client = new QueryClient({ defaultOptions: { queries: { retry: false } } })}><EditRequestPage /></QueryClientProvider>);
    expect(await screen.findByText("This request can't be edited now.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to request" })).toHaveAttribute("href", "/resident/requests/r1");
});

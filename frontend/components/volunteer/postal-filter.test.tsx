import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { renderWithClient } from "@/test/utils";
import AvailableRequests from "./available-requests";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));

const list = "/api/requests?view=available";
let profile: unknown;

function lists() {
    return vi.mocked(api.get).mock.calls.map(([path]) => path).filter(path => path !== "/api/profile");
}
function add(code: string) {
    fireEvent.change(screen.getByLabelText("Add a postal code"), { target: { value: code } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
}
async function shown(codes: string[]) {
    renderWithClient(<AvailableRequests />);
    await waitFor(() => expect(lists()).toContain(codes.length ? `${list}&postalCodes=${encodeURIComponent(codes.join(","))}` : list));
}

beforeEach(() => {
    profile = { preferredPostalCodes: [] };
    vi.mocked(api.get).mockReset().mockImplementation(async (path: string) => {
        if (path !== "/api/profile") return [];
        if (profile instanceof Error) throw profile;
        return profile;
    });
});
afterEach(cleanup);

it("is a labelled search form", async () => {
    profile = { preferredPostalCodes: ["T2P1J9"] };
    await shown(["T2P1J9"]);
    expect(screen.getByRole("search", { name: "Filter by postal code" })).toBeInTheDocument();
    expect(screen.getByText("Showing requests in:")).toBeInTheDocument();
});

it("filters by the profile's preferred codes", async () => {
    profile = { preferredPostalCodes: ["T2P1J9", "T3A0B1"] };
    await shown(["T2P1J9", "T3A0B1"]);
    expect(lists()).toEqual([`${list}&postalCodes=T2P1J9%2CT3A0B1`]);
    expect(screen.getByRole("button", { name: "Remove T2P 1J9" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove T3A 0B1" })).toBeInTheDocument();
});

it("sends no codes when the profile has none", async () => {
    await shown([]);
    expect(lists()).toEqual([list]);
    expect(screen.getByText("Showing all postal codes.")).toBeInTheDocument();
});

it("waits for the profile before asking for the list", async () => {
    let finish = () => {};
    vi.mocked(api.get).mockImplementation((path: string) => path === "/api/profile"
        ? new Promise(resolve => { finish = () => resolve({ preferredPostalCodes: ["T2P1J9"] }); })
        : Promise.resolve([]));
    renderWithClient(<AvailableRequests />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/api/profile"));
    expect(lists()).toEqual([]);
    await act(async () => finish());
    await waitFor(() => expect(lists()).toEqual([`${list}&postalCodes=T2P1J9`]));
});

it("adds a typed code in the stored form", async () => {
    await shown([]);
    add("t2p 1j9");
    await waitFor(() => expect(lists()).toContain(`${list}&postalCodes=T2P1J9`));
    expect(screen.getByRole("button", { name: "Remove T2P 1J9" })).toBeInTheDocument();
    expect(screen.getByLabelText("Add a postal code")).toHaveValue("");
});

it("shows an error for an invalid code and does not add it", async () => {
    await shown([]);
    add("A1B 2C3");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a Calgary postal code, for example T2P 1J9.");
    expect(lists()).toEqual([list]);
});

it("does not add a duplicate", async () => {
    profile = { preferredPostalCodes: ["T2P1J9"] };
    await shown(["T2P1J9"]);
    add("T2P 1J9");
    expect(screen.getByRole("alert")).toHaveTextContent("Each code can only be added once.");
    expect(screen.getAllByRole("button", { name: "Remove T2P 1J9" })).toHaveLength(1);
});

it("blocks the 11th code", async () => {
    const ten = ["T2P1J0", "T2P1J1", "T2P1J2", "T2P1J3", "T2P1J4", "T2P1J5", "T2P1J6", "T2P1J7", "T2P1J8", "T2P1J9"];
    profile = { preferredPostalCodes: ten };
    await shown(ten);
    add("T3A0B1");
    expect(screen.getByRole("alert")).toHaveTextContent("You can filter by up to 10 codes.");
    expect(screen.queryByRole("button", { name: "Remove T3A 0B1" })).not.toBeInTheDocument();
});

it("refetches with the other codes when a chip is removed", async () => {
    profile = { preferredPostalCodes: ["T2P1J9", "T3A0B1"] };
    await shown(["T2P1J9", "T3A0B1"]);
    fireEvent.click(screen.getByRole("button", { name: "Remove T2P 1J9" }));
    await waitFor(() => expect(lists()).toContain(`${list}&postalCodes=T3A0B1`));
});

it("Show all removes the postalCodes param", async () => {
    profile = { preferredPostalCodes: ["T2P1J9"] };
    await shown(["T2P1J9"]);
    fireEvent.click(screen.getByRole("button", { name: "Show all areas" }));
    await waitFor(() => expect(lists()).toContain(list));
    expect(screen.queryByRole("button", { name: "Show all areas" })).not.toBeInTheDocument();
});

it("loads the list without a filter when the profile fails", async () => {
    profile = new Error("down");
    await shown([]);
    expect(lists()).toEqual([list]);
});

it("keeps the volunteer's changes when the profile refetches", async () => {
    profile = { preferredPostalCodes: ["T2P1J9"] };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AvailableRequests /></QueryClientProvider>);
    await waitFor(() => expect(lists()).toContain(`${list}&postalCodes=T2P1J9`));
    add("T3A0B1");
    await waitFor(() => expect(lists()).toContain(`${list}&postalCodes=T2P1J9%2CT3A0B1`));
    profile = { preferredPostalCodes: ["T2N4X7"] };
    await act(async () => { await client.refetchQueries({ queryKey: ["profile"] }); });
    expect(screen.getByRole("button", { name: "Remove T3A 0B1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove T2N 4X7" })).not.toBeInTheDocument();
    expect(lists()).not.toContain(`${list}&postalCodes=T2N4X7`);
});

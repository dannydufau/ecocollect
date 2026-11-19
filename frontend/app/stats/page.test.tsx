import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { usePublicStream } from "@/lib/public-stream";
import { formatTimestamp } from "@/lib/time";
import { renderWithClient } from "@/test/utils";
import StatsPage from "./page";

vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("@/lib/public-stream", () => ({ usePublicStream: vi.fn() }));

const stats = {
    deliveries: 4, itemsDelivered: 7, estimatedWeightKgDelivered: 17.5, ecopointsAwarded: 141.75,
    byWasteType: [
        { wasteType: "Electronics", deliveries: 3, itemsDelivered: 6, estimatedWeightKgDelivered: 12.5 },
        { wasteType: "Displays", deliveries: 1, itemsDelivered: 1, estimatedWeightKgDelivered: 5 },
    ],
    updatedAt: "2026-11-20T18:00:00Z",
};
const zero = { deliveries: 0, itemsDelivered: 0, estimatedWeightKgDelivered: 0, ecopointsAwarded: 0, byWasteType: [], updatedAt: "2026-11-20T18:00:00Z" };
let fetcher: ReturnType<typeof vi.fn>;

function answer(status: number, body: unknown) {
    fetcher.mockImplementation(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}
const value = (label: string) => screen.getByText(label, { selector: "dt" }).nextElementSibling;

beforeEach(() => {
    fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    answer(200, stats);
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
});

it("shows the four totals, the table and the update time", async () => {
    renderWithClient(<StatsPage />);
    expect(await screen.findByText("Deliveries", { selector: "dt" })).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith("/api/public/stats");
    expect(value("Deliveries")).toHaveTextContent("4");
    expect(value("Items delivered")).toHaveTextContent("7");
    expect(value("Estimated kg delivered")).toHaveTextContent("17.50");
    expect(value("EcoPoints awarded")).toHaveTextContent("141.75");
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows.map(row => row.textContent)).toEqual(["Waste typeDeliveriesItemsKg", "Electronics3612.50", "Displays115.00"]);
    expect(screen.getByText(formatTimestamp(stats.updatedAt))).toBeInTheDocument();
});

it("shows zeros, not blanks or NaN, when nothing was delivered", async () => {
    answer(200, zero);
    renderWithClient(<StatsPage />);
    expect(await screen.findByText("Deliveries", { selector: "dt" })).toBeInTheDocument();
    expect(value("Deliveries")).toHaveTextContent("0");
    expect(value("Items delivered")).toHaveTextContent("0");
    expect(value("Estimated kg delivered")).toHaveTextContent("0.00");
    expect(value("EcoPoints awarded")).toHaveTextContent("0.00");
    expect(document.body.textContent).not.toContain("NaN");
});

it("refetches when the stream says the stats changed", async () => {
    renderWithClient(<StatsPage />);
    await screen.findByText("Deliveries", { selector: "dt" });
    expect(usePublicStream).toHaveBeenCalledWith({ stats: true }, expect.any(Function));
    answer(200, { ...stats, deliveries: 5 });
    await act(async () => vi.mocked(usePublicStream).mock.lastCall![1]());
    await waitFor(() => expect(value("Deliveries")).toHaveTextContent("5"));
    expect(fetcher).toHaveBeenCalledTimes(2);
});

it("sends no Authorization header and needs no login", async () => {
    renderWithClient(<StatsPage />);
    await screen.findByText("Deliveries", { selector: "dt" });
    for (const [, init] of fetcher.mock.calls) expect(new Headers((init as RequestInit | undefined)?.headers).has("Authorization")).toBe(false);
});

it("shows an error with a retry", async () => {
    answer(500, { error: { code: "internal", message: "down" } });
    renderWithClient(<StatsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not load the stats.");
    answer(200, stats);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Deliveries", { selector: "dt" })).toBeInTheDocument();
});

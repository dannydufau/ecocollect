import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { api } from "@/lib/api";
import type { Award } from "@/lib/types";
import { renderWithClient } from "@/test/utils";
import EcoPointsPage from "./page";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() }, isAuthError: vi.fn(() => false) }));

const delivery: Award = {
    awardId: "resident-delivery", kind: "DELIVERY", earnedAs: "resident", points: 13, formula: "RESIDENT",
    requestId: "00000000-0000-4000-8000-000000000001", assignmentId: "assignment-1",
    categoryName: "Computers/Laptops", quantity: 2, estimatedWeightKg: 5, awardedAt: "2026-11-20T20:00:00Z",
};
const cancellation: Award = {
    ...delivery, awardId: "cancellation", kind: "CANCELLATION", earnedAs: "volunteer", points: 26, formula: "VOLUNTEER",
    requestId: "00000000-0000-4000-8000-000000000002", assignmentId: "assignment-2",
    categoryName: null, quantity: null, estimatedWeightKg: null, awardedAt: "2026-11-22T20:00:00Z",
};
const volunteerDelivery: Award = {
    ...delivery, awardId: "volunteer-delivery", earnedAs: "volunteer", points: 26, formula: "VOLUNTEER",
    requestId: "00000000-0000-4000-8000-000000000003", assignmentId: "assignment-3", awardedAt: "2026-11-21T20:00:00Z",
};
const response = { total: 65, asResident: 13, asVolunteer: 52, awards: [cancellation, volunteerDelivery, delivery] };

afterEach(() => {
    cleanup();
    vi.resetAllMocks();
});

describe("EcoPoints page", () => {
    it("loads R1 and displays each total with two decimals", async () => {
        vi.mocked(api.get).mockResolvedValue(response);
        renderWithClient(<EcoPointsPage />);
        expect((await screen.findByText("Total")).nextElementSibling).toHaveTextContent("65.00");
        expect(screen.getByText("As resident").nextElementSibling).toHaveTextContent("13.00");
        expect(screen.getByText("As volunteer").nextElementSibling).toHaveTextContent("52.00");
        expect(api.get).toHaveBeenCalledWith("/api/ecopoints");
    });

    it("keeps newest-first order and hides cancellation request details", async () => {
        vi.mocked(api.get).mockResolvedValue(response);
        renderWithClient(<EcoPointsPage />);
        const rows = await screen.findAllByRole("listitem");
        expect(rows.map(row => within(row).getByRole("heading").textContent)).toEqual(["Cancellation", "Delivery", "Delivery"]);
        expect(rows.map(row => row.querySelector("time")?.dateTime)).toEqual(response.awards.map(award => award.awardedAt));
        expect(within(rows[0]).getAllByText("—")).toHaveLength(2);
        expect(within(rows[0]).getByText("26.00 points")).toBeInTheDocument();
        expect(within(rows[0]).getByText("3 × quantity + 4 × estimated weight (kg)")).toBeInTheDocument();
        expect(within(rows[0]).queryByRole("link")).not.toBeInTheDocument();
    });

    it("links delivery awards to the page for the role that earned them", async () => {
        vi.mocked(api.get).mockResolvedValue(response);
        renderWithClient(<EcoPointsPage />);
        const links = await screen.findAllByRole("link", { name: "View request" });
        expect(links[0]).toHaveAttribute("href", `/volunteer/requests/${volunteerDelivery.requestId}`);
        expect(links[1]).toHaveAttribute("href", `/resident/requests/${delivery.requestId}`);
    });

    it("shows No awards yet for an empty history", async () => {
        vi.mocked(api.get).mockResolvedValue({ total: 0, asResident: 0, asVolunteer: 0, awards: [] });
        renderWithClient(<EcoPointsPage />);
        expect(await screen.findByText("No awards yet")).toBeInTheDocument();
        expect(screen.queryByRole("list")).not.toBeInTheDocument();
    });

    it("shows the loading state while R1 is pending", () => {
        vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
        renderWithClient(<EcoPointsPage />);
        expect(screen.getByRole("status")).toHaveTextContent("Loading EcoPoints...");
    });

    it("shows an error and lets the user retry", async () => {
        vi.mocked(api.get).mockRejectedValueOnce(new Error("Unavailable")).mockResolvedValueOnce(response);
        renderWithClient(<EcoPointsPage />);
        expect(await screen.findByRole("alert")).toHaveTextContent("Could not load your EcoPoints. Please try again.");
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByText("Total")).toBeInTheDocument();
        expect(api.get).toHaveBeenCalledTimes(2);
    });
});

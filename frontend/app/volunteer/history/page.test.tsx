import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { api } from "@/lib/api";
import { formatTimestamp } from "@/lib/time";
import type { VolunteerAssignment } from "@/lib/types";
import { renderWithClient } from "@/test/utils";
import VolunteerHistoryPage from "./page";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));

const assignment = (status: VolunteerAssignment["assignment"]["status"], id: string): VolunteerAssignment["assignment"] => ({
    assignmentId: id, window: { windowId: "w1", date: "2026-11-20", startHour: 11 }, status,
    acceptedAt: "2026-11-15T18:00:00Z", collectedAt: null, endedAt: status === "Active" || status === "Collected" ? null : "2026-11-20T19:00:00Z",
    endReason: status === "Active" || status === "Collected" ? null : status === "Delivered" ? "Delivered" : status,
});
const delivered: VolunteerAssignment = {
    requestId: "r1", category: { categoryId: "laptops", name: "Computers/Laptops", wasteType: "Computers" },
    quantity: 2, estimatedWeightKg: 5, postalCode: "T2P1J9", status: "Delivered", assignment: assignment("Delivered", "a1"),
};
const missed: VolunteerAssignment = {
    requestId: "r2", category: null, quantity: null, estimatedWeightKg: null, postalCode: null, status: null, assignment: assignment("Missed_Pickup", "a2"),
};
const collected: VolunteerAssignment = { ...delivered, requestId: "r3", status: "Collected", assignment: assignment("Collected", "a3") };

beforeEach(() => { vi.mocked(api.get).mockResolvedValue([delivered, missed, collected]); });
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("shows a delivered row with its category, status words and a link", async () => {
    renderWithClient(<VolunteerHistoryPage />);
    const link = (await screen.findAllByRole("link", { name: "2 × Computers/Laptops" })).find(item => item.getAttribute("href") === "/volunteer/requests/r1")!;
    const row = link.closest("li")!;
    expect(row).toHaveTextContent("Delivered");
    expect(row).toHaveTextContent("5.00 kg · T2P 1J9");
    expect(row).toHaveTextContent(`Accepted ${formatTimestamp("2026-11-15T18:00:00Z")}`);
    expect(row).toHaveTextContent("Fri, Nov 20, 11:00 to 12:00");
    expect(api.get).toHaveBeenCalledWith("/api/requests?view=volunteer");
});

it("shows a missed row with null request fields as status, window and end time, without a link", async () => {
    renderWithClient(<VolunteerHistoryPage />);
    const row = (await screen.findAllByRole("listitem")).find(item => item.textContent?.includes("Missed"))!;
    expect(row).toHaveTextContent("Fri, Nov 20, 11:00 to 12:00");
    expect(row).toHaveTextContent(`Ended ${formatTimestamp("2026-11-20T19:00:00Z")}`);
    expect(within(row).queryByRole("link")).not.toBeInTheDocument();
    expect(row).toHaveTextContent("Request no longer available to you");
});

it("puts Collected rows first with the Record delivery label", async () => {
    renderWithClient(<VolunteerHistoryPage />);
    const rows = await screen.findAllByRole("listitem");
    expect(within(rows[0]).getByRole("link")).toHaveAttribute("href", "/volunteer/requests/r3");
    expect(rows[0]).toHaveTextContent("Record delivery");
    expect(rows[1]).not.toHaveTextContent("Record delivery");
});

it.each([
    ["Active", "Active"], ["Collected", "Collected"], ["Delivered", "Delivered"],
    ["Cancelled by me", "Volunteer_Cancelled"], ["Cancelled by resident", "Resident_Cancelled"], ["Missed", "Missed_Pickup"],
])("the %s chip asks for assignmentStatus=%s", async (chip, value) => {
    renderWithClient(<VolunteerHistoryPage />);
    const group = screen.getByRole("group", { name: "Assignment status" });
    fireEvent.click(within(group).getByRole("button", { name: chip }));
    expect(within(group).getByRole("button", { name: chip })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(`/api/requests?view=volunteer&assignmentStatus=${value}`));
});

it("starts on All, which sends no assignmentStatus", async () => {
    renderWithClient(<VolunteerHistoryPage />);
    const group = screen.getByRole("group", { name: "Assignment status" });
    expect(within(group).getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/api/requests?view=volunteer"));
});

it("shows the empty state", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    renderWithClient(<VolunteerHistoryPage />);
    expect(await screen.findByText("No assignments yet.")).toBeInTheDocument();
    expect(screen.getByText("Accept a request to see it here.")).toBeInTheDocument();
});

it("names the filter when a filtered list is empty", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    renderWithClient(<VolunteerHistoryPage />);
    fireEvent.click(within(screen.getByRole("group", { name: "Assignment status" })).getByRole("button", { name: "Missed" }));
    expect(await screen.findByText("No missed assignments.")).toBeInTheDocument();
});

it("has the page title as the h1", () => {
    renderWithClient(<VolunteerHistoryPage />);
    expect(screen.getByRole("heading", { level: 1, name: "My assignments" })).toBeInTheDocument();
});

it("shows an error with a retry", async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error("down")).mockResolvedValue([delivered]);
    renderWithClient(<VolunteerHistoryPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not load your assignments.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "2 × Computers/Laptops" })).toBeInTheDocument();
});

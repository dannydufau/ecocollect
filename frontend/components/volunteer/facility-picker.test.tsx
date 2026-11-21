import { cleanup, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import type { Facility } from "@/lib/types";
import { renderWithClient } from "@/test/utils";
import { FacilityPicker } from "./facility-picker";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));

const facilities: Facility[] = [
    { facilityId: "f1", name: "Demo Recycling Facility", street: "2808 Ogden Rd SE", postalCode: "T2G4R7", specialInstructions: "Use the loading dock.", acceptedCategoryIds: ["laptops"] },
    { facilityId: "f2", name: "North Electronics Depot", street: "1100 64 Ave NE", postalCode: "T2E7Y5", specialInstructions: null, acceptedCategoryIds: ["laptops"] },
];

beforeEach(() => {
    vi.mocked(api.get).mockReset().mockResolvedValue(facilities);
});

// Vitest does not clean the page between tests by itself
afterEach(cleanup);

it("asks for the facilities of the category", async () => {
    renderWithClient(<FacilityPicker categoryId="small appliances" value={null} onChange={() => {}} />);
    await screen.findAllByRole("radio");
    expect(api.get).toHaveBeenCalledWith("/api/facilities?categoryId=small%20appliances");
});

it("calls onChange with the facility id when a row is chosen", async () => {
    const onChange = vi.fn();
    renderWithClient(<FacilityPicker categoryId="laptops" value={null} onChange={onChange} />);
    await userEvent.click(await screen.findByRole("radio", { name: /North Electronics Depot/ }));
    expect(onChange).toHaveBeenCalledWith("f2");
});

it("checks the row that matches value", async () => {
    renderWithClient(<FacilityPicker categoryId="laptops" value="f2" onChange={() => {}} />);
    expect(await screen.findByRole("radio", { name: /North Electronics Depot/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Demo Recycling Facility/ })).not.toBeChecked();
});

it("shows special instructions only when they are set", async () => {
    renderWithClient(<FacilityPicker categoryId="laptops" value={null} onChange={() => {}} />);
    expect(await screen.findByText("Use the loading dock.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /North Electronics Depot/ }).closest("label")).toHaveTextContent(/^North Electronics Depot\s*1100 64 Ave NE, Calgary T2E 7Y5$/);
});

it("shows a message when no facility accepts the category", async () => {
    vi.mocked(api.get).mockResolvedValue([]);
    renderWithClient(<FacilityPicker categoryId="laptops" value={null} onChange={() => {}} />);
    expect(await screen.findByText("No facility accepts this category right now.")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
});

it("shows an error", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("down"));
    renderWithClient(<FacilityPicker categoryId="laptops" value={null} onChange={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not load the facilities. Please try again.");
});

it("shows the address with a spaced postal code", async () => {
    renderWithClient(<FacilityPicker categoryId="laptops" value={null} onChange={() => {}} />);
    const code = await screen.findByText("T2G 4R7");
    expect(code.parentElement).toHaveTextContent("2808 Ogden Rd SE, Calgary T2G 4R7");
});

it("fills the chosen row", async () => {
    renderWithClient(<FacilityPicker categoryId="laptops" value="f2" onChange={() => {}} />);
    expect((await screen.findByRole("radio", { name: /North Electronics Depot/ })).closest("label")).toHaveClass("bg-accent-2-200");
    expect(screen.getByRole("radio", { name: /Demo Recycling Facility/ }).closest("label")).toHaveClass("bg-surface");
});

it("lets the volunteer try again after an error", async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error("down"));
    renderWithClient(<FacilityPicker categoryId="laptops" value={null} onChange={() => {}} />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findAllByRole("radio")).toHaveLength(2);
});

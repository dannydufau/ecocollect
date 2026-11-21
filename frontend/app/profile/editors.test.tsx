import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { api, ApiError } from "@/lib/api";
import type { Profile } from "@/lib/types";
import { renderWithClient } from "@/test/utils";
import ProfilePage from "./page";

vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ refreshRoles: async () => [], signOut: async () => {} }) }));
vi.mock("@/lib/api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/api")>()),
    api: { get: vi.fn(), patch: vi.fn() },
}));

const resident: Profile = {
    accountId: "maya", email: "maya@example.com", firstName: "Maya", lastName: "Chen", publicName: "Maya C.",
    dateOfBirth: "1990-05-01", roles: ["resident"], address: { street: "123 Main St", city: "Calgary", postalCode: "T2P1J9" },
    preferredPostalCodes: [], createdAt: "2026-10-28T16:15:00Z",
};
const volunteer: Profile = { ...resident, roles: ["volunteer"], address: null, preferredPostalCodes: ["T2P1J9", "T3A0B1"] };
const both: Profile = { ...resident, roles: ["resident", "volunteer"], preferredPostalCodes: ["T3A0B1"] };

async function show(profile: Profile) {
    vi.mocked(api.get).mockResolvedValue(profile);
    vi.mocked(api.patch).mockResolvedValue(profile);
    renderWithClient(<ProfilePage />);
    await screen.findByRole("heading", { name: "Account" });
}
const edit = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));

beforeEach(() => vi.mocked(api.patch).mockReset());
afterEach(() => {
    cleanup();
    vi.resetAllMocks();
});

it("gives each card its own Edit button, and only one form is open at a time", async () => {
    await show(both);
    edit("Edit public name");
    expect(screen.getByLabelText("Public name")).toBeInTheDocument();
    edit("Edit address");
    expect(screen.queryByLabelText("Public name")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Street")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit public name" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit preferred postal codes" })).toBeInTheDocument();
});

it("sends only the public name, shows Profile saved and gives the focus back to Edit", async () => {
    await show(resident);
    edit("Edit public name");
    type("Public name", "  Maya  ");
    vi.mocked(api.patch).mockResolvedValue({ ...resident, publicName: "Maya" });
    save();
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/profile", { publicName: "Maya" }));
    expect(await screen.findByText("Profile saved.")).toBeInTheDocument();
    expect(screen.getByText("Maya", { selector: "p" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit public name" })).toHaveFocus());
});

it("asks for a public name and sends nothing when it is empty", async () => {
    await show(resident);
    edit("Edit public name");
    type("Public name", "   ");
    save();
    expect(await screen.findByText("Enter a public name.")).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
});

it("sends nothing when Save is pressed without a change, and closes the form", async () => {
    await show(resident);
    edit("Edit address");
    save();
    expect(api.patch).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Street")).not.toBeInTheDocument();
    expect(screen.queryByText("Profile saved.")).not.toBeInTheDocument();
});

it("cleans up a changed address before sending it", async () => {
    await show(resident);
    edit("Edit address");
    type("Postal code", "t3a 0b1");
    save();
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/profile", { address: { street: "123 Main St", postalCode: "T3A0B1" } }));
});

it("checks the address before sending it", async () => {
    await show(resident);
    edit("Edit address");
    type("Street", " ");
    type("Postal code", "M5V 2T6");
    save();
    expect(await screen.findByText("Enter your street address.")).toBeInTheDocument();
    expect(screen.getByText("Enter a Calgary postal code, for example T2P 1J9.")).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
});

it("shows the contract sentence when the address is locked and keeps the form open", async () => {
    await show(resident);
    edit("Edit address");
    type("Street", "9 Other St");
    vi.mocked(api.patch).mockRejectedValue(new ApiError(409, { error: { code: "address_locked", message: "locked" } }));
    save();
    expect(await screen.findByRole("alert")).toHaveTextContent("You can't change your address while you have an Open or Assigned request.");
    expect(screen.getByLabelText("Street")).toHaveValue("9 Other St");
});

it("shows server field errors under their inputs", async () => {
    await show(resident);
    edit("Edit address");
    type("Postal code", "T3A0B1");
    vi.mocked(api.patch).mockRejectedValue(new ApiError(400, {
        error: { code: "validation_failed", message: "Check", details: { fields: { "address.postalCode": "Not a Calgary code." } } },
    }));
    save();
    expect(await screen.findByText("Not a Calgary code.")).toBeInTheDocument();
});

it("shows the empty text for no codes and saves added codes in their clean form", async () => {
    await show({ ...volunteer, preferredPostalCodes: [] });
    expect(screen.getByText(/You have no saved codes/)).toBeInTheDocument();
    edit("Edit preferred postal codes");
    fireEvent.click(screen.getByRole("button", { name: "Add postal code" }));
    type("Postal code 1", "t2p 1j9");
    save();
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/profile", { preferredPostalCodes: ["T2P1J9"] }));
});

it("removes a code, ignores a blank row and stops adding at 3", async () => {
    await show({ ...volunteer, preferredPostalCodes: ["T2P1J9", "T3A0B1", "T2N4X7"] });
    edit("Edit preferred postal codes");
    expect(screen.getByRole("button", { name: "Add postal code" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Remove postal code 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Add postal code" }));
    save();
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/profile", { preferredPostalCodes: ["T2P1J9", "T2N4X7"] }));
});

it("refuses a repeated code", async () => {
    await show(volunteer);
    edit("Edit preferred postal codes");
    type("Postal code 2", "T2P 1J9");
    save();
    expect(await screen.findByText("Each code can only be added once.")).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
});

it("throws away the changes on Cancel and gives the focus back", async () => {
    await show(resident);
    edit("Edit public name");
    type("Public name", "Someone else");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(api.patch).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit public name" })).toHaveFocus());
    expect(within(screen.getByRole("heading", { name: "Account" }).parentElement!).getByText("Maya C.")).toBeInTheDocument();
});

it("shows a message and keeps the form for any other failure", async () => {
    await show(resident);
    edit("Edit public name");
    type("Public name", "Maya");
    vi.mocked(api.patch).mockRejectedValue(new TypeError("Failed to fetch"));
    save();
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not reach the server.");
    expect(screen.getByLabelText("Public name")).toBeInTheDocument();
});

it("keeps a typed draft when another card is opened, and highlights the one being edited", async () => {
    await show(both);
    edit("Edit public name");
    type("Public name", "Half typed");
    edit("Edit address");
    expect(screen.queryByLabelText("Public name")).not.toBeInTheDocument();
    expect(screen.getByText("You have unsaved changes here. Press Edit to finish them.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Address" }).closest("section")).toHaveClass("ring-2");
    expect(screen.getByRole("heading", { name: "Account" }).closest("section")).not.toHaveClass("ring-2");
    edit("Edit public name");
    expect(screen.getByLabelText("Public name")).toHaveValue("Half typed");
});

it("clears a kept draft on Cancel", async () => {
    await show(resident);
    edit("Edit public name");
    type("Public name", "Half typed");
    edit("Edit address");
    edit("Edit public name");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/unsaved changes/)).not.toBeInTheDocument();
    edit("Edit public name");
    expect(screen.getByLabelText("Public name")).toHaveValue("Maya C.");
});

it("keeps the lock note on the address after the server says it is locked", async () => {
    await show(resident);
    vi.mocked(api.patch).mockRejectedValue(new ApiError(409, { error: { code: "address_locked", message: "locked" } }));
    edit("Edit address");
    type("Street", "9 New Rd");
    save();
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Locked while you have an Open or Assigned request.")).toBeInTheDocument();
});

it("does not say there are unsaved changes when the typing is put back to the saved value", async () => {
    await show(resident);
    edit("Edit public name");
    type("Public name", "Half typed");
    type("Public name", "Maya C.");
    edit("Edit address");
    expect(screen.queryByText(/unsaved changes/)).not.toBeInTheDocument();
});

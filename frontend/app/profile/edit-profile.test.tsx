import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { Profile } from "@/lib/types";
import { renderWithClient } from "@/test/utils";
import { EditProfile } from "./edit-profile";

vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("@/lib/api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/api")>()),
    api: { patch: vi.fn() },
}));

const resident: Profile = {
    accountId: "maya", email: "maya@example.com", firstName: "Maya", lastName: "Chen", publicName: "Maya C.",
    dateOfBirth: "1990-05-01", roles: ["resident"], address: { street: "123 Main St", city: "Calgary", postalCode: "T2P1J9" },
    preferredPostalCodes: [], createdAt: "2026-10-28T16:15:00Z",
};
const volunteer: Profile = { ...resident, roles: ["volunteer"], address: null, preferredPostalCodes: ["T2P1J9", "T3A0B1"] };

function open(profile: Profile) {
    renderWithClient(<EditProfile profile={profile} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
}
function type(label: string, value: string) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));

let invalidate: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
    invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    vi.mocked(api.patch).mockResolvedValue(resident);
});
afterEach(() => {
    cleanup();
    vi.resetAllMocks();
    vi.restoreAllMocks();
});

it("sends only the public name when only that changed", async () => {
    open(resident);
    type("Public name", "  Maya  Chen ");
    save();
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/profile", { publicName: "Maya  Chen" }));
});

it("normalizes a changed address before sending it", async () => {
    open(resident);
    type("Postal code", "t3a 0b1");
    save();
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/profile", { address: { street: "123 Main St", postalCode: "T3A0B1" } }));
});

it("sends nothing when Save is pressed without a change, and closes the form", () => {
    open(resident);
    save();
    expect(api.patch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Edit profile" })).toBeInTheDocument();
});

it("blocks a 4th postal code", () => {
    open(volunteer);
    const add = screen.getByRole("button", { name: "Add postal code" });
    fireEvent.click(add);
    expect(screen.getByLabelText("Postal code 3")).toBeInTheDocument();
    expect(add).toBeDisabled();
    fireEvent.click(add);
    expect(screen.queryByLabelText("Postal code 4")).not.toBeInTheDocument();
});

it("shows an error for a duplicate code and sends nothing", () => {
    open(volunteer);
    fireEvent.click(screen.getByRole("button", { name: "Add postal code" }));
    type("Postal code 3", "t2p 1j9");
    save();
    expect(screen.getByText("Each code can only be added once.")).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
});

it("replaces the whole code list after a removal", async () => {
    open(volunteer);
    fireEvent.click(screen.getByRole("button", { name: "Remove postal code 1" }));
    save();
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/profile", { preferredPostalCodes: ["T3A0B1"] }));
});

it("shows the address fields and the codes for an account with both roles", () => {
    open({ ...resident, roles: ["resident", "volunteer"] });
    expect(screen.getByLabelText("Street")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add postal code" })).toBeInTheDocument();
});

it("shows the address_locked sentence and keeps the form open", async () => {
    vi.mocked(api.patch).mockRejectedValue(new ApiError(409, { error: { code: "address_locked", message: "locked" } }));
    open(resident);
    type("Street", "9 New Rd");
    save();
    expect(await screen.findByRole("alert")).toHaveTextContent("You can't change your address while you have an open or assigned request.");
    expect(screen.getByLabelText("Street")).toHaveValue("9 New Rd");
});

it("shows a 400 field error under its input", async () => {
    vi.mocked(api.patch).mockRejectedValue(new ApiError(400, { error: { code: "validation", message: "bad", details: { fields: { publicName: "Too long." } } } }));
    open(resident);
    type("Public name", "Someone");
    save();
    expect(await screen.findByText("Too long.")).toBeInTheDocument();
    expect(screen.getByLabelText("Public name")).toHaveAttribute("aria-invalid", "true");
});

it("invalidates the profile and closes the form on success", async () => {
    open(resident);
    type("Public name", "Maya!");
    save();
    expect(await screen.findByRole("button", { name: "Edit profile" })).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["profile"] });
});

it("Cancel restores the old values", () => {
    open(resident);
    type("Public name", "Changed");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit profile" }));
    expect(screen.getByLabelText("Public name")).toHaveValue("Maya C.");
    expect(api.patch).not.toHaveBeenCalled();
});

it("is busy while saving and a second click sends nothing", async () => {
    let finish = () => {};
    vi.mocked(api.patch).mockReturnValue(new Promise((resolve) => { finish = () => resolve(resident); }));
    open(resident);
    type("Public name", "Maya!");
    save();
    const button = await screen.findByRole("button", { name: "Saving..." });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    fireEvent.submit(button.closest("form")!);
    expect(api.patch).toHaveBeenCalledTimes(1);
    await act(async () => finish());
});

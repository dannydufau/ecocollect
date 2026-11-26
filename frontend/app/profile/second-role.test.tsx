import { afterEach, beforeEach, expect, it, vi, type Mock } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Profile } from "@/lib/types";
import { renderWithClient } from "@/test/utils";
import type { Notice } from "./notice";
import { SecondRole } from "./second-role";

vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("@/lib/auth-context", () => ({ useAuth: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/api")>()),
    api: { get: vi.fn(), post: vi.fn() },
}));

const resident: Profile = {
    accountId: "maya", email: "maya@example.com", firstName: "Maya", lastName: "Chen", publicName: "Maya C.",
    dateOfBirth: "1990-05-01", roles: ["resident"], address: { street: "123 Main St", city: "Calgary", postalCode: "T2P1J9" },
    preferredPostalCodes: [], createdAt: "2026-10-28T16:15:00Z",
};
const volunteer: Profile = { ...resident, roles: ["volunteer"], address: null };
const termsBox = "I have read and accept the terms and safety guidelines";
const conflict = (code: string) => new ApiError(409, { error: { code, message: code } });

let refreshRoles: ReturnType<typeof vi.fn>;
let invalidate: ReturnType<typeof vi.spyOn>;
let onDone: Mock<(notice: Notice) => void>;

// The card starts closed. Opening it loads the terms, and the tick enables the button.
async function show(profile: Profile) {
    renderWithClient(<SecondRole profile={profile} onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: profile.roles.includes("resident") ? "Become a volunteer" : "Become a resident" }));
    fireEvent.click(await screen.findByLabelText(termsBox));
}
const activate = () => fireEvent.click(screen.getByRole("button", { name: "Activate role" }));
function type(label: string, value: string) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
    refreshRoles = vi.fn().mockResolvedValue(["resident", "volunteer"]);
    onDone = vi.fn();
    vi.mocked(useAuth).mockReturnValue({ refreshRoles } as never);
    vi.mocked(api.get).mockResolvedValue({ termsDocumentId: "terms_3", content: "Some terms", publishedAt: "2026-11-01T00:00:00Z" });
    vi.mocked(api.post).mockResolvedValue({ roles: ["resident", "volunteer"] });
    invalidate = vi.spyOn(QueryClient.prototype, "invalidateQueries");
});
afterEach(() => {
    cleanup();
    vi.resetAllMocks();
    vi.restoreAllMocks();
});

it("starts as a closed card with a button, and Cancel closes the form again", async () => {
    renderWithClient(<SecondRole profile={resident} onDone={onDone} />);
    expect(screen.getByRole("heading", { name: "Add a role" })).toBeInTheDocument();
    expect(screen.queryByLabelText(termsBox)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Become a volunteer" }));
    expect(screen.getByRole("heading", { name: "Become a volunteer" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "Add a role" })).toBeInTheDocument();
});

it("asks a volunteer for an address and posts nothing without one", async () => {
    await show(volunteer);
    activate();
    expect(await screen.findByText("Enter your street address.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
});

it("posts the resident role with a normalized address", async () => {
    await show(volunteer);
    type("Street", " 9 New Rd ");
    type("Postal code", "t3a 0b1");
    activate();
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/profile/roles", {
        role: "resident", termsDocumentId: "terms_3", address: { street: "9 New Rd", postalCode: "T3A0B1" },
    }));
});

it("posts the volunteer role with its codes and the terms id", async () => {
    await show(resident);
    fireEvent.click(screen.getByRole("button", { name: "Add postal code" }));
    type("Postal code 1", "t2p 1j9");
    activate();
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/profile/roles", {
        role: "volunteer", termsDocumentId: "terms_3", preferredPostalCodes: ["T2P1J9"],
    }));
});

it("refreshes the roles once, invalidates the profile and says it worked", async () => {
    await show(resident);
    activate();
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ variant: "success", text: "You can now use EcoCollect as a volunteer." }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["profile"] });
    expect(refreshRoles).toHaveBeenCalledTimes(1);
});

it("tells the person to reload when the role was added but the refresh failed", async () => {
    refreshRoles.mockRejectedValue(new Error("network"));
    await show(volunteer);
    type("Street", "9 New Rd");
    type("Postal code", "T3A0B1");
    activate();
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({
        variant: "warning", text: "You are now a resident, but we could not refresh your session. Please reload the page.",
    }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["profile"] });
});

it("says so when the role is already active", async () => {
    vi.mocked(api.post).mockRejectedValue(conflict("role_already_active"));
    await show(resident);
    activate();
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ variant: "info", text: "You already have this role." }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["profile"] });
    expect(refreshRoles).not.toHaveBeenCalled();
});

it("refetches the terms and shows the contract sentence when they are outdated", async () => {
    vi.mocked(api.post).mockRejectedValue(conflict("terms_outdated"));
    await show(resident);
    vi.mocked(api.get).mockResolvedValue({ termsDocumentId: "terms_4", content: "New terms", publishedAt: "2026-11-10T00:00:00Z" });
    activate();
    expect(await screen.findByText("The terms have changed. Please read and accept them again.")).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["terms"] });
    await waitFor(() => expect(screen.getByLabelText(termsBox)).not.toBeChecked());
    expect(screen.getByRole("button", { name: "Activate role" })).toBeDisabled();
});

it("shows a 400 field error under its input", async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError(400, { error: { code: "validation_failed", message: "Some fields are invalid.", details: { fields: { "address.street": "Enter your street." } } } }));
    await show(volunteer);
    type("Street", "9 New Rd");
    type("Postal code", "T3A0B1");
    activate();
    expect(await screen.findByText("Enter your street.")).toBeInTheDocument();
});

it("keeps the button disabled until the terms are ticked", async () => {
    renderWithClient(<SecondRole profile={resident} onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "Become a volunteer" }));
    const button = screen.getByRole("button", { name: "Activate role" });
    expect(button).toBeDisabled();
    fireEvent.click(await screen.findByLabelText(termsBox));
    expect(button).toBeEnabled();
});

it("shows nothing for an account with both roles", () => {
    const { container } = renderWithClient(<SecondRole profile={{ ...resident, roles: ["resident", "volunteer"] }} onDone={onDone} />);
    expect(container).toBeEmptyDOMElement();
});

it("does not post twice when clicked again while busy", async () => {
    let finish = () => {};
    vi.mocked(api.post).mockReturnValue(new Promise((resolve) => { finish = () => resolve({ roles: ["resident", "volunteer"] }); }));
    await show(resident);
    activate();
    const busy = await screen.findByRole("button", { name: "Adding the role..." });
    expect(busy).toBeDisabled();
    fireEvent.click(busy);
    fireEvent.submit(busy.closest("form")!);
    expect(api.post).toHaveBeenCalledTimes(1);
    await act(async () => finish());
});

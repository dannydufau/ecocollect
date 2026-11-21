import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { api, ApiError } from "@/lib/api";
import type { Profile } from "@/lib/types";
import { renderWithClient } from "@/test/utils";
import ProfilePage from "./page";

vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ refreshRoles: async () => [], signOut: async () => {} }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ refreshRoles: async () => [] }) }));
vi.mock("@/lib/api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/api")>()),
    api: { get: vi.fn(), post: vi.fn() },
}));

const resident: Profile = {
    accountId: "maya", email: "maya@example.com", firstName: "Maya", lastName: "Chen", publicName: "Maya C.",
    dateOfBirth: "1990-05-01", roles: ["resident"], address: { street: "123 Main St", city: "Calgary", postalCode: "T2P1J9" },
    preferredPostalCodes: [], createdAt: "2026-10-28T16:15:00Z",
};
const volunteer: Profile = { ...resident, accountId: "sam", roles: ["volunteer"], address: null, preferredPostalCodes: ["T2P1J9", "T3A0B1", "T2N4X7"] };
const both: Profile = { ...resident, roles: ["resident", "volunteer"], preferredPostalCodes: ["T3A0B1"] };

function value(label: string) {
    return screen.getByText(label).nextElementSibling;
}

afterEach(() => {
    cleanup();
    vi.resetAllMocks();
});

it("shows the loading state first", () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    renderWithClient(<ProfilePage />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading your profile...");
});

it("shows a resident's account card and the address card, with no postal codes card", async () => {
    vi.mocked(api.get).mockResolvedValue(resident);
    renderWithClient(<ProfilePage />);
    expect(await screen.findByRole("heading", { name: "Account" })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/api/profile");
    expect(value("Username")).toHaveTextContent("maya");
    expect(value("Email")).toHaveTextContent("maya@example.com");
    expect(value("Name")).toHaveTextContent("Maya Chen");
    expect(value("Date of birth")).toHaveTextContent("May 1, 1990");
    expect(value("Public name")).toHaveTextContent("Maya C.");
    expect(value("Roles")).toHaveTextContent("Resident");
    expect(screen.getByRole("heading", { name: "Address" }).parentElement).toHaveTextContent("123 Main StCalgary, T2P 1J9");
    expect(screen.queryByRole("heading", { name: "Preferred postal codes" })).not.toBeInTheDocument();
});

it("shows a volunteer's postal codes with a space and no address card", async () => {
    vi.mocked(api.get).mockResolvedValue(volunteer);
    renderWithClient(<ProfilePage />);
    expect(await screen.findByRole("heading", { name: "Preferred postal codes" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["T2P 1J9", "T3A 0B1", "T2N 4X7"]);
    expect(value("Roles")).toHaveTextContent("Volunteer");
    expect(screen.queryByRole("heading", { name: "Address" })).not.toBeInTheDocument();
});

it("says so when a volunteer has no saved codes", async () => {
    vi.mocked(api.get).mockResolvedValue({ ...volunteer, preferredPostalCodes: [] });
    renderWithClient(<ProfilePage />);
    expect(await screen.findByText(/You have no saved codes/)).toBeInTheDocument();
});

it("shows the address and the postal codes and both role pills for an account with both roles", async () => {
    vi.mocked(api.get).mockResolvedValue(both);
    renderWithClient(<ProfilePage />);
    expect(await screen.findByRole("heading", { name: "Address" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Preferred postal codes" })).toBeInTheDocument();
    expect(value("Roles")).toHaveTextContent("ResidentVolunteer");
});

it("shows member since from createdAt", async () => {
    vi.mocked(api.get).mockResolvedValue(resident);
    renderWithClient(<ProfilePage />);
    expect(await screen.findByText("Member since")).toBeInTheDocument();
    expect(value("Member since")).toHaveTextContent("Oct 28, 2026");
});

it("links to the public profile", async () => {
    vi.mocked(api.get).mockResolvedValue(resident);
    renderWithClient(<ProfilePage />);
    expect(await screen.findByRole("link", { name: "View my public profile" })).toHaveAttribute("href", "/profiles/maya");
});

it("shows the error for a 401 with a retry", async () => {
    vi.mocked(api.get).mockRejectedValue(new ApiError(401, null));
    renderWithClient(<ProfilePage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Please log in to view your profile.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
});

it("shows the error for a 404", async () => {
    vi.mocked(api.get).mockRejectedValue(new ApiError(404, null));
    renderWithClient(<ProfilePage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not find your profile.");
});

it("keeps the success message after the role card is gone", async () => {
    let profile: Profile = resident;
    vi.mocked(api.get).mockImplementation(async (path: string) => (
        path === "/api/terms" ? { termsDocumentId: "terms_3", content: "Some terms", publishedAt: "2026-11-01T00:00:00Z" } : profile
    ));
    vi.mocked(api.post).mockImplementation(async () => {
        profile = both;
        return { roles: ["resident", "volunteer"] };
    });
    renderWithClient(<ProfilePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Become a volunteer" }));
    fireEvent.click(await screen.findByLabelText("I have read and accept the terms and safety guidelines"));
    fireEvent.click(screen.getByRole("button", { name: "Activate role" }));
    expect(await screen.findByText("You can now use EcoCollect as a volunteer.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Add a role" })).not.toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: "Become a volunteer" })).not.toBeInTheDocument();
    expect(screen.getByText("You can now use EcoCollect as a volunteer.")).toBeInTheDocument();
});

it("has a Notifications card with a plain status", async () => {
    vi.mocked(api.get).mockResolvedValue(resident);
    renderWithClient(<ProfilePage />);
    const card = (await screen.findByRole("heading", { name: "Notifications" })).closest("section")!;
    expect(card.querySelector("svg[aria-hidden=true]")).not.toBeNull();
    expect(await screen.findByText("This browser does not support device notifications.")).toBeInTheDocument();
});

it("shows the public profile link near the top, before the Account card", async () => {
    vi.mocked(api.get).mockResolvedValue(resident);
    renderWithClient(<ProfilePage />);
    const account = await screen.findByRole("heading", { name: "Account" });
    const link = screen.getByRole("link", { name: "View my public profile" });
    expect(link.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("puts a divider between the account list and the public name, and marks the danger zone", async () => {
    vi.mocked(api.get).mockResolvedValue(resident);
    renderWithClient(<ProfilePage />);
    const account = (await screen.findByRole("heading", { name: "Account" })).closest("section")!;
    expect(account.querySelector("dl + hr")).not.toBeNull();
    const danger = screen.getByRole("heading", { name: "Deactivate account" }).closest("section")!;
    expect(danger).toHaveClass("border-danger-border");
    expect(danger.querySelector("h2 svg[aria-hidden=true]")).not.toBeNull();
});

import { afterEach, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { api, ApiError } from "@/lib/api";
import type { Profile } from "@/lib/types";
import { renderWithClient } from "@/test/utils";
import ProfilePage from "./page";

vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ refreshRoles: vi.fn() }) }));
vi.mock("@/lib/api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/api")>()),
    api: { get: vi.fn() },
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

it("shows a resident's details with the address and no postal codes", async () => {
    vi.mocked(api.get).mockResolvedValue(resident);
    renderWithClient(<ProfilePage />);
    expect(await screen.findByText("Account id")).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/api/profile");
    expect(value("Account id")).toHaveTextContent("maya");
    expect(value("Name")).toHaveTextContent("Maya Chen");
    expect(value("Public name")).toHaveTextContent("Maya C.");
    expect(value("Birth date")).toHaveTextContent("1990-05-01");
    expect(value("Roles")).toHaveTextContent("Resident");
    expect(value("Address")).toHaveTextContent("123 Main St, Calgary T2P1J9");
    expect(screen.queryByText("Preferred postal codes")).not.toBeInTheDocument();
});

it("shows a volunteer's postal codes and no address", async () => {
    vi.mocked(api.get).mockResolvedValue(volunteer);
    renderWithClient(<ProfilePage />);
    expect(await screen.findByText("Preferred postal codes")).toBeInTheDocument();
    expect(value("Preferred postal codes")).toHaveTextContent("T2P1J9, T3A0B1, T2N4X7");
    expect(value("Roles")).toHaveTextContent("Volunteer");
    expect(screen.queryByText("Address")).not.toBeInTheDocument();
});

it("shows both the address and the postal codes for an account with both roles", async () => {
    vi.mocked(api.get).mockResolvedValue(both);
    renderWithClient(<ProfilePage />);
    expect(await screen.findByText("Address")).toBeInTheDocument();
    expect(value("Preferred postal codes")).toHaveTextContent("T3A0B1");
    expect(value("Roles")).toHaveTextContent("Resident and Volunteer");
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

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { usePublicStream } from "@/lib/public-stream";
import { calgaryToday, formatDate } from "@/lib/time";
import { renderWithClient } from "@/test/utils";
import PublicProfilePage from "./page";

vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("next/navigation", () => ({ useParams: () => ({ accountId: "maya" }) }));
vi.mock("@/lib/public-stream", () => ({ usePublicStream: vi.fn() }));

// The server must never send these, the page must not show them even if it does
const profile = {
    accountId: "maya", publicName: "Maya C.", roles: ["resident", "volunteer"], memberSince: "2026-10-28T16:15:00Z",
    firstName: "Maya", lastName: "Chenowitz", dateOfBirth: "1990-05-01", address: { street: "123 Secret St", postalCode: "T2P1J9" },
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let fetcher: ReturnType<typeof vi.fn>;

function answer(profileStatus = 200) {
    fetcher.mockImplementation(async (path: string) => path.endsWith("/stats")
        ? json(200, { accountId: "maya", ecopoints: 39 })
        : profileStatus === 200 ? json(200, profile) : json(profileStatus, { error: { code: "profile_unavailable", message: "gone" } }));
}

beforeEach(() => {
    fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    answer();
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
});

it("shows the public name, roles, member since and EcoPoints, signed out", async () => {
    renderWithClient(<PublicProfilePage />);
    expect(await screen.findByRole("heading", { name: "Maya C." })).toBeInTheDocument();
    expect(screen.getByText("@maya")).toBeInTheDocument();
    expect(screen.getByText("Resident")).toBeInTheDocument();
    expect(screen.getByText("Volunteer")).toBeInTheDocument();
    expect(screen.getByText(formatDate(calgaryToday(new Date(profile.memberSince))))).toBeInTheDocument();
    expect(await screen.findByText("39.00")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith("/api/public/profiles/maya");
    expect(fetcher).toHaveBeenCalledWith("/api/public/profiles/maya/stats");
});

it("never shows the legal name, birth date or address", async () => {
    renderWithClient(<PublicProfilePage />);
    await screen.findByText("39.00");
    const text = document.body.textContent ?? "";
    for (const secret of ["Chenowitz", "1990-05-01", "123 Secret St", "T2P1J9"]) expect(text).not.toContain(secret);
});

it("sends no Authorization header", async () => {
    renderWithClient(<PublicProfilePage />);
    await screen.findByText("39.00");
    for (const [, init] of fetcher.mock.calls) expect(new Headers((init as RequestInit | undefined)?.headers).has("Authorization")).toBe(false);
});

it("shows not found and no EcoPoints for a 404", async () => {
    answer(404);
    renderWithClient(<PublicProfilePage />);
    expect(await screen.findByRole("heading", { name: "Profile not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See the community stats" })).toHaveAttribute("href", "/stats");
    expect(screen.queryByText("EcoPoints")).not.toBeInTheDocument();
    expect(screen.queryByText("39.00")).not.toBeInTheDocument();
});

it("refetches both when the public stream says the profile changed", async () => {
    renderWithClient(<PublicProfilePage />);
    await screen.findByText("39.00");
    expect(usePublicStream).toHaveBeenCalledWith({ profile: "maya" }, expect.any(Function));
    fetcher.mockClear();
    const onChange = vi.mocked(usePublicStream).mock.lastCall![1];
    await act(async () => onChange());
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
});

it("shows an error with a retry", async () => {
    answer(500);
    renderWithClient(<PublicProfilePage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not load this profile.");
    answer();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Maya C." })).toBeInTheDocument();
});

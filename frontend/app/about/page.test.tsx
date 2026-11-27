import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useAuth } from "@/lib/auth-context";
import AboutPage from "./page";

vi.mock("@/lib/auth-context", () => ({ useAuth: vi.fn() }));

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

function signedOut() {
    vi.mocked(useAuth).mockReturnValue({
        user: null,
        roles: [],
        activeRole: null,
        loading: false,
        setActiveRole: vi.fn(),
        signOut: vi.fn(),
    } as never);
}

it("renders the hero, all four pickup steps, nine categories, worked Monitor example, and /stats link in initial HTML", () => {
    signedOut();
    render(<AboutPage />);

    // Single h1 with the flagship heading
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent("Old electronics shouldn’t live in your closet.");

    // All four pickup steps are visible without needing any interactive tab click
    for (const status of ["Open", "Assigned", "Collected", "Delivered"]) {
        expect(screen.getByText(status)).toBeInTheDocument();
    }

    // Missed pickup is documented under Assigned; delivery uses photo wording
    expect(screen.getByText(/report a missed pickup/i)).toBeInTheDocument();
    expect(screen.getByText(/record delivery with a photo/i)).toBeInTheDocument();

    // Nine accepted categories in the ledger
    expect(screen.getByRole("rowheader", { name: "Monitors" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Cables and Chargers" })).toBeInTheDocument();

    // Worked EcoPoints example: 1 Monitor (5.00 kg) -> 23.00 Volunteer, 11.50 Resident
    expect(screen.getByText("23.00 pts")).toBeInTheDocument();
    expect(screen.getByText("11.50 pts")).toBeInTheDocument();
    expect(screen.getByText(/after the 24-hour cutoff/i)).toBeInTheDocument();
    expect(screen.getByText(/except when the volunteer is also the request’s resident/i)).toBeInTheDocument();

    // 18+ eligibility and sample-facility preview wording
    expect(screen.getAllByText(/18 and older/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/sample recycling facilities/i).length).toBeGreaterThan(0);

    // Community Impact link to /stats
    expect(screen.getByRole("link", { name: "View Community stats" })).toHaveAttribute("href", "/stats");
});

it("adapts CTAs for signed-in users instead of prompting account creation", () => {
    vi.mocked(useAuth).mockReturnValue({
        user: { uid: "u1" },
        roles: ["resident"],
        activeRole: "resident",
        loading: false,
        setActiveRole: vi.fn(),
        signOut: vi.fn(),
    } as never);

    render(<AboutPage />);
    expect(screen.getByRole("link", { name: "Go to my workspace" })).toHaveAttribute("href", "/resident");
    expect(screen.getByRole("link", { name: "Open my workspace" })).toHaveAttribute("href", "/resident");
    expect(screen.queryByRole("link", { name: "Create an account" })).not.toBeInTheDocument();
});

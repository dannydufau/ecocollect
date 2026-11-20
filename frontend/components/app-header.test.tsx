import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useAuth } from "@/lib/auth-context";
import AppHeader from "./app-header";

const router = { replace: vi.fn(), push: vi.fn() };
let pathname = "/resident";
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => pathname }));
vi.mock("@/lib/auth-context", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/notification-bell", () => ({ default: () => <span data-slot="bell" /> }));

const setActiveRole = vi.fn();

function signedIn(roles: string[], activeRole: string | null = roles.length === 1 ? roles[0] : null) {
    vi.mocked(useAuth).mockReturnValue({ user: { uid: "u1" }, roles, activeRole, loading: false, setActiveRole, signOut: vi.fn() } as never);
}

function setWidth(width: number) {
    act(() => {
        window.innerWidth = width;
        window.dispatchEvent(new Event("resize"));
    });
}

beforeEach(() => setWidth(1200));

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    pathname = "/resident";
});

it("shows the resident links", () => {
    signedIn(["resident"]);
    render(<AppHeader />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "New request" })).toHaveAttribute("href", "/resident/requests/new");
    expect(within(nav).getByRole("link", { name: "My requests" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "EcoPoints" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "History" })).not.toBeInTheDocument();
});

it("shows the volunteer links", () => {
    pathname = "/volunteer";
    signedIn(["volunteer"]);
    render(<AppHeader />);
    expect(screen.getByRole("link", { name: "History" })).toHaveAttribute("href", "/volunteer/history");
    expect(screen.getByRole("link", { name: "Available" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "New request" })).not.toBeInTheDocument();
});

it("lets a both-roles account switch to volunteer", () => {
    signedIn(["resident", "volunteer"], "resident");
    render(<AppHeader />);
    const group = screen.getByRole("group", { name: "Active role" });
    expect(within(group).getByRole("button", { name: "Resident" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(group).getByRole("button", { name: "Volunteer" }));
    expect(setActiveRole).toHaveBeenCalledWith("volunteer");
    expect(router.push).toHaveBeenCalledWith("/volunteer");
});

it("shows only the shared links and the switcher before a both-roles account picks a role", () => {
    pathname = "/ecopoints";
    signedIn(["resident", "volunteer"], null);
    render(<AppHeader />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["EcoPoints"]);
    expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("group", { name: "Active role" })).toBeInTheDocument();
});

it.each([
    ["resident", "resident", "/resident"],
    ["volunteer", "volunteer", "/volunteer"],
])("sends the brand link of a %s tab to its home", (role, active, home) => {
    signedIn(["resident", "volunteer"], active);
    render(<AppHeader />);
    expect(screen.getByRole("link", { name: "EcoCollect" })).toHaveAttribute("href", home);
});

it("sends the brand link to /choose-role before a role is picked and to /login when signed out", () => {
    pathname = "/ecopoints";
    signedIn(["resident", "volunteer"], null);
    const { unmount } = render(<AppHeader />);
    expect(screen.getByRole("link", { name: "EcoCollect" })).toHaveAttribute("href", "/choose-role");
    unmount();
    vi.mocked(useAuth).mockReturnValue({ user: null, roles: [], activeRole: null, loading: false } as never);
    render(<AppHeader />);
    expect(screen.getByRole("link", { name: "EcoCollect" })).toHaveAttribute("href", "/login");
});

it("shows the active role tag for a both-roles account only on a phone", () => {
    signedIn(["resident", "volunteer"], "volunteer");
    render(<AppHeader />);
    const group = screen.getByRole("group", { name: "Active role" });
    expect(screen.getAllByText("Volunteer")).toEqual([within(group).getByText("Volunteer")]);
    setWidth(500);
    expect(screen.getByText("Volunteer", { selector: "span" })).toBeInTheDocument();
});

it("shows a role tag and no switcher for one role", () => {
    signedIn(["resident"]);
    render(<AppHeader />);
    expect(screen.getByText("Resident")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Active role" })).not.toBeInTheDocument();
});

it("shows the brand, stats and sign in when signed out", () => {
    pathname = "/stats";
    vi.mocked(useAuth).mockReturnValue({ user: null, roles: [], activeRole: null, loading: false, setActiveRole } as never);
    render(<AppHeader />);
    expect(screen.getByRole("link", { name: "EcoCollect" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Community stats" })).toHaveAttribute("href", "/stats");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "EcoPoints" })).not.toBeInTheDocument();
});

it.each(["/login", "/register", "/demo", "/demo/start"])("shows only the brand on %s", (path) => {
    pathname = path;
    signedIn(["resident"]);
    render(<AppHeader />);
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(["EcoCollect"]);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

it("shows only the brand while auth loads", () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, roles: [], activeRole: null, loading: true, setActiveRole } as never);
    render(<AppHeader />);
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(["EcoCollect"]);
});

it("shows the brand and Log out on /choose-role", () => {
    pathname = "/choose-role";
    signedIn(["resident", "volunteer"]);
    render(<AppHeader />);
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(["EcoCollect"]);
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
});

it("uses a bottom bar with three short links and a More menu below 960px", () => {
    signedIn(["resident"]);
    render(<AppHeader />);
    setWidth(500);
    expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Mobile" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["Requests", "New", "Points"]);

    const more = within(nav).getByRole("button", { name: "More" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    const menu = document.getElementById(more.getAttribute("aria-controls")!)!;
    expect(within(menu).queryByRole("link", { name: "Notifications" })).not.toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: "Profile" })).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: "Log out" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(within(nav).queryByRole("link", { name: "Profile" })).not.toBeInTheDocument();
});

it("shows the volunteer short links and puts the switcher in More", () => {
    pathname = "/volunteer";
    signedIn(["resident", "volunteer"], "volunteer");
    setWidth(500);
    render(<AppHeader />);
    const nav = screen.getByRole("navigation", { name: "Mobile" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["Available", "Assignments", "Points"]);
    fireEvent.click(within(nav).getByRole("button", { name: "More" }));
    fireEvent.click(within(nav).getByRole("button", { name: "Resident" }));
    expect(setActiveRole).toHaveBeenCalledWith("resident");
    expect(router.push).toHaveBeenCalledWith("/resident");
    expect(within(nav).getByRole("button", { name: "More" })).toHaveAttribute("aria-expanded", "false");
});

it("closes More when a link is chosen and when the page changes", () => {
    signedIn(["resident"]);
    setWidth(500);
    const { rerender } = render(<AppHeader />);
    const more = screen.getByRole("button", { name: "More" });
    fireEvent.click(more);
    fireEvent.click(screen.getByRole("link", { name: "Profile" }));
    expect(more).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(more);
    pathname = "/ecopoints";
    rerender(<AppHeader />);
    expect(more).toHaveAttribute("aria-expanded", "false");
});

it("has no bottom bar at 1200px", () => {
    signedIn(["resident"]);
    render(<AppHeader />);
    expect(screen.queryByRole("navigation", { name: "Mobile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();
});

it("marks only the best matching link as the current page", () => {
    pathname = "/resident/requests/new";
    signedIn(["resident"]);
    render(<AppHeader />);
    expect(screen.getByRole("link", { name: "New request" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "My requests" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "EcoPoints" })).not.toHaveAttribute("aria-current");
});

it("has the bell slot and the logout button for a signed-in user", () => {
    signedIn(["resident"]);
    render(<AppHeader />);
    expect(document.querySelector('[data-slot="bell"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
});

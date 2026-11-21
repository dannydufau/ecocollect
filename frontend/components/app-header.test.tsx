import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

// Both navs are in the page, CSS shows one of them, so each check looks inside the nav it is about
const main = () => screen.getByRole("navigation", { name: "Main" });
const mobile = () => screen.getByRole("navigation", { name: "Mobile" });
function openMore() {
    const more = within(mobile()).getByRole("button", { name: "More" });
    fireEvent.click(more);
    return { more, menu: document.getElementById(more.getAttribute("aria-controls")!)! };
}

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
    expect(within(main()).getByRole("link", { name: "Assignments" })).toHaveAttribute("href", "/volunteer/history");
    expect(within(mobile()).getByRole("link", { name: "Assignments" })).toHaveAttribute("href", "/volunteer/history");
    expect(within(main()).getByRole("link", { name: "Available" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "History" })).not.toBeInTheDocument();
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
    expect(screen.getByText("Volunteer", { selector: "span" })).toHaveClass("min-[960px]:hidden");
    expect(screen.getByRole("group", { name: "Active role" }).parentElement!.parentElement).toHaveClass("hidden", "min-[960px]:block");
});

it("keeps the one-role tag at every width", () => {
    signedIn(["resident"]);
    render(<AppHeader />);
    expect(screen.getByText("Resident", { selector: "span" })).not.toHaveClass("min-[960px]:hidden");
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
    expect(within(mobile()).getAllByRole("link").map((link) => link.textContent)).toEqual(["Requests", "New", "Points"]);
    expect(within(mobile()).getAllByRole("link").every((link) => link.querySelector("svg[aria-hidden=true]"))).toBe(true);

    const { more, menu } = openMore();
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(within(menu).queryByRole("link", { name: "Notifications" })).not.toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: "Profile" })).toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: "Community stats" })).toHaveAttribute("href", "/stats");
    expect(within(menu).getByRole("button", { name: "Log out" })).toBeInTheDocument();
});

it("closes More on Escape and gives focus back to the More button", () => {
    signedIn(["resident"]);
    render(<AppHeader />);
    const { more, menu } = openMore();
    within(menu).getByRole("link", { name: "Profile" }).focus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(within(mobile()).queryByRole("link", { name: "Profile" })).not.toBeInTheDocument();
    expect(more).toHaveFocus();
});

it("closes More on a click outside it and leaves focus where the click put it", () => {
    signedIn(["resident"]);
    render(<AppHeader />);
    const { more, menu } = openMore();
    fireEvent.pointerDown(within(menu).getByRole("link", { name: "Profile" }));
    expect(more).toHaveAttribute("aria-expanded", "true");
    fireEvent.pointerDown(document.body);
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(more).not.toHaveFocus();
});

it("shows the volunteer short links and puts the switcher in More", () => {
    pathname = "/volunteer";
    signedIn(["resident", "volunteer"], "volunteer");
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
    const { rerender } = render(<AppHeader />);
    const { more, menu } = openMore();
    fireEvent.click(within(menu).getByRole("link", { name: "Profile" }));
    expect(more).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(more);
    pathname = "/ecopoints";
    rerender(<AppHeader />);
    expect(more).toHaveAttribute("aria-expanded", "false");
});

it("switches between the top nav and the bottom bar with CSS at 960px", () => {
    signedIn(["resident"]);
    render(<AppHeader />);
    expect(main()).toHaveClass("hidden", "min-[960px]:flex");
    expect(mobile()).toHaveClass("min-[960px]:hidden");
    expect(screen.getByRole("button", { name: "Log out" }).parentElement).toHaveClass("hidden", "min-[960px]:flex");
});

it("shows Community stats to signed-in users on the wide header", () => {
    signedIn(["volunteer"]);
    render(<AppHeader />);
    const stats = screen.getByRole("link", { name: "Community stats" });
    expect(stats).toHaveAttribute("href", "/stats");
    expect(stats.parentElement).toHaveClass("min-[960px]:flex");
});

it("marks the current bottom link with aria-current, the role colour and a bar", () => {
    pathname = "/volunteer/history";
    signedIn(["volunteer"]);
    render(<AppHeader />);
    const link = within(mobile()).getByRole("link", { name: "Assignments" });
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link).toHaveClass("aria-[current=page]:text-accent-2-800", "aria-[current=page]:font-bold", "aria-[current=page]:after:h-[3px]");
    expect(within(mobile()).getByRole("link", { name: "Available" })).not.toHaveAttribute("aria-current");
});

it("marks only the best matching link as the current page", () => {
    pathname = "/resident/requests/new";
    signedIn(["resident"]);
    render(<AppHeader />);
    expect(screen.getByRole("link", { name: "New request" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "My requests" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "EcoPoints" })).not.toHaveAttribute("aria-current");
    expect(within(mobile()).getByRole("link", { name: "New" })).toHaveAttribute("aria-current", "page");
});

it("has the bell slot and the logout button for a signed-in user", () => {
    signedIn(["resident"]);
    render(<AppHeader />);
    expect(document.querySelector('[data-slot="bell"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
});

import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useAuth } from "@/lib/auth-context";
import { pageWidth } from "@/components/ui";
import AppHeader from "./app-header";

const router = { replace: vi.fn(), push: vi.fn() };
let pathname = "/resident";
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => pathname }));
vi.mock("@/lib/auth-context", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/notification-bell", () => ({ default: () => <span data-slot="bell" /> }));

// jsdom has no showModal or close, so these only set and remove the open attribute
const showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
HTMLDialogElement.prototype.showModal = showModal;
HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };

const setActiveRole = vi.fn();

function signedIn(roles: string[], activeRole: string | null = roles.length === 1 ? roles[0] : null, verificationState = "verified") {
    vi.mocked(useAuth).mockReturnValue({
        user: { uid: "u1" },
        roles,
        activeRole,
        loading: false,
        verificationState,
        setActiveRole,
        signOut: vi.fn(),
    } as never);
}

// Both navs are in the page, CSS shows one of them, so each check looks inside the nav it is about
const banner = () => screen.getByRole("banner");
const main = () => screen.getByRole("navigation", { name: "Main" });
const mobile = () => screen.getByRole("navigation", { name: "Mobile" });
function openMore() {
    const more = within(mobile()).getByRole("button", { name: "More" });
    fireEvent.click(more);
    return { more, menu: document.getElementById(more.getAttribute("aria-controls")!)! };
}

const accountButton = () => within(screen.getByRole("banner")).getByRole("button", { name: "Account" });
function openAccount() {
    const button = accountButton();
    fireEvent.click(button);
    return { button, menu: document.getElementById(button.getAttribute("aria-controls")!)! };
}

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    pathname = "/resident";
});

it("keeps the header bar in the same width as the pages", () => {
    signedIn(["resident"]);
    render(<AppHeader />);
    expect(screen.getByRole("banner").firstElementChild).toHaveClass(...pageWidth.split(" "), "px-4", "sm:px-8");
});

it("hides the notification bell and protected nav for an unverified user while keeping stats and Log out", () => {
    pathname = "/verify-email";
    signedIn(["resident"], "resident", "unverified");
    render(<AppHeader />);
    expect(document.querySelector("[data-slot='bell']")).toBeNull();
    expect(screen.queryByRole("link", { name: "My requests" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Community stats" })).toHaveAttribute("href", "/stats");
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
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

it("shows My requests, Available, shared links and the switcher before a both-roles account picks a role", () => {
    pathname = "/ecopoints";
    signedIn(["resident", "volunteer"], null);
    render(<AppHeader />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual(["My requests", "Available", "EcoPoints"]);
    expect(within(openAccount().menu).getByRole("link", { name: "Profile" })).toHaveAttribute("href", "/profile");
    expect(screen.getAllByRole("group", { name: "Active role" })).not.toHaveLength(0);
});

it.each([
    ["resident", "/resident"],
    ["volunteer", "/volunteer"],
])("sends the brand link of a %s tab to its home", (active, home) => {
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

it("shows the switcher from 960 px and a badge that switches role on a phone, for a both-roles account", () => {
    signedIn(["resident", "volunteer"], "volunteer");
    render(<AppHeader />);
    const badge = screen.getByRole("button", { name: "Volunteer. Switch to Resident view" });
    expect(badge).toHaveClass("min-[960px]:hidden");
    expect(badge.querySelector("svg[aria-hidden=true]")).not.toBeNull();
    expect(within(banner()).getByRole("group", { name: "Active role" }).parentElement).toHaveClass("hidden", "min-[960px]:block");
});

it("switches to the other role with one tap on the phone badge and lands on its home page", () => {
    signedIn(["resident", "volunteer"], "volunteer");
    render(<AppHeader />);
    fireEvent.click(screen.getByRole("button", { name: "Volunteer. Switch to Resident view" }));
    expect(setActiveRole).toHaveBeenCalledWith("resident");
    expect(router.push).toHaveBeenCalledWith("/resident");
});

it("does not make the badge of a one-role account a button", () => {
    signedIn(["resident"]);
    render(<AppHeader />);
    expect(screen.queryByRole("button", { name: /Switch to/ })).not.toBeInTheDocument();
});

it("has no Acting as label, and keeps the labelled group with pressed buttons", () => {
    signedIn(["resident", "volunteer"], "resident");
    render(<AppHeader />);
    expect(screen.queryByText("Acting as")).not.toBeInTheDocument();
    const group = within(banner()).getByRole("group", { name: "Active role" });
    expect(within(group).getByRole("button", { name: "Resident" })).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByRole("button", { name: "Volunteer" })).toHaveAttribute("aria-pressed", "false");
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

const escape = (menu: HTMLElement) => fireEvent(menu, new Event("cancel", { cancelable: true }));

it("opens More as a modal dialog with a Close button", () => {
    signedIn(["resident"]);
    render(<AppHeader />);
    const { more, menu } = openMore();
    expect(menu.tagName).toBe("DIALOG");
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(menu).toHaveAttribute("open");
    expect(menu).toHaveAccessibleName("More");
    expect(more).toHaveAttribute("aria-haspopup", "dialog");
    expect(within(menu).getByRole("button", { name: "Close" })).toBeInTheDocument();
});

it("closes More on Escape and gives focus back to the More button", () => {
    signedIn(["resident"]);
    render(<AppHeader />);
    const { more, menu } = openMore();
    within(menu).getByRole("link", { name: "Profile" }).focus();
    escape(menu);
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(menu).not.toHaveAttribute("open");
    expect(within(mobile()).queryByRole("link", { name: "Profile" })).not.toBeInTheDocument();
    expect(more).toHaveFocus();
});

it("closes More with the Close button and gives focus back to the More button", () => {
    signedIn(["resident"]);
    render(<AppHeader />);
    const { more, menu } = openMore();
    fireEvent.click(within(menu).getByRole("button", { name: "Close" }));
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(menu).not.toHaveAttribute("open");
    expect(more).toHaveFocus();
});

it("closes More when the backdrop is tapped, but not when the sheet itself is", () => {
    signedIn(["resident"]);
    render(<AppHeader />);
    const { more, menu } = openMore();
    fireEvent.click(within(menu).getByRole("heading", { name: "More" }));
    expect(more).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(menu);
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(more).toHaveFocus();
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
    expect(within(nav).getByRole("button", { name: "More" })).toHaveFocus();
});

it("closes More when a link is chosen and when the page changes", () => {
    signedIn(["resident"]);
    const { rerender } = render(<AppHeader />);
    const { more, menu } = openMore();
    fireEvent.click(within(menu).getByRole("link", { name: "Profile" }));
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(more).toHaveFocus();

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
    expect(accountButton().parentElement!.parentElement).toHaveClass("hidden", "min-[960px]:block");
});

it("puts Community stats, Profile and Log out in the Account menu on the wide header", () => {
    signedIn(["volunteer"]);
    render(<AppHeader />);
    const { menu } = openAccount();
    expect(within(menu).getByRole("link", { name: "Community stats" })).toHaveAttribute("href", "/stats");
    expect(within(menu).getByRole("link", { name: "Profile" })).toHaveAttribute("href", "/profile");
    expect(within(menu).getByRole("button", { name: "Log out" })).toBeInTheDocument();
    expect(within(main()).queryByRole("link", { name: "Profile" })).not.toBeInTheDocument();
});

it("closes the Account menu on Escape and gives focus back to its button", () => {
    signedIn(["resident"]);
    render(<AppHeader />);
    const { button, menu } = openAccount();
    expect(button).toHaveAttribute("aria-expanded", "true");
    within(menu).getByRole("link", { name: "Profile" }).focus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(menu).toHaveAttribute("hidden");
    expect(button).toHaveFocus();
});

it("closes the Account menu on a click outside and leaves focus where the click put it", () => {
    signedIn(["resident"]);
    render(<AppHeader />);
    const { button, menu } = openAccount();
    fireEvent.pointerDown(within(menu).getByRole("link", { name: "Profile" }));
    expect(button).toHaveAttribute("aria-expanded", "true");
    fireEvent.pointerDown(document.body);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).not.toHaveFocus();
});

it("closes the Account menu when a link is chosen and when the page changes", () => {
    signedIn(["resident"]);
    const { rerender } = render(<AppHeader />);
    const { button, menu } = openAccount();
    fireEvent.click(within(menu).getByRole("link", { name: "Community stats" }));
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    pathname = "/ecopoints";
    rerender(<AppHeader />);
    expect(button).toHaveAttribute("aria-expanded", "false");
});

it("marks the current page inside the Account menu", () => {
    pathname = "/profile";
    signedIn(["resident"]);
    render(<AppHeader />);
    const { menu } = openAccount();
    expect(within(menu).getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
    expect(within(menu).getByRole("link", { name: "Community stats" })).not.toHaveAttribute("aria-current");
});

it("keeps the wide header in one row, in the order brand, links, switcher, bell, Account", () => {
    signedIn(["resident", "volunteer"], "resident");
    render(<AppHeader />);
    expect(banner().firstElementChild).toHaveClass("min-[960px]:flex-nowrap");
    expect(main()).not.toHaveClass("flex-wrap");
    const order = [
        screen.getByRole("link", { name: "EcoCollect" }), within(main()).getByRole("link", { name: "My requests" }),
        within(banner()).getByRole("group", { name: "Active role" }), document.querySelector('[data-slot="bell"]')!, accountButton(),
    ];
    order.slice(1).forEach((element, index) => {
        expect(order[index].compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
});

it("gives the main links, the role switcher and the Account button the same hover and pressed states", () => {
    signedIn(["resident", "volunteer"], "resident");
    render(<AppHeader />);
    const states = ["soft-transition", "hover:bg-accent-100", "active:bg-accent-200"];
    expect(within(main()).getByRole("link", { name: "My requests" })).toHaveClass(...states, "aria-[current=page]:bg-accent-200", "aria-[current=page]:font-bold");
    expect(accountButton()).toHaveClass(...states);
    expect(within(within(banner()).getByRole("group", { name: "Active role" })).getByRole("button", { name: "Volunteer" })).toHaveClass(...states);
});

it("marks the current bottom link with aria-current, the role colour and a bar", () => {
    pathname = "/volunteer/history";
    signedIn(["volunteer"]);
    render(<AppHeader />);
    const link = within(mobile()).getByRole("link", { name: "Assignments" });
    expect(link).toHaveAttribute("aria-current", "page");
    expect(link).toHaveClass("aria-[current=page]:text-role-volunteer", "aria-[current=page]:font-bold", "aria-[current=page]:after:h-[3px]");
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
    expect(within(openAccount().menu).getByRole("button", { name: "Log out" })).toBeInTheDocument();
});

it("the More sheet is a bottom sheet with its own slide and backdrop styles, and room for the home indicator", () => {
    signedIn(["resident"]);
    render(<AppHeader />);
    const { menu } = openMore();
    expect(menu).toHaveClass("more-sheet");
    expect(menu.firstElementChild).toHaveClass("pb-[max(1rem,env(safe-area-inset-bottom))]");
});

it("opens and closes More again after it was closed", () => {
    signedIn(["resident"]);
    render(<AppHeader />);
    const { more, menu } = openMore();
    escape(menu);
    fireEvent.click(more);
    expect(menu).toHaveAttribute("open");
    expect(showModal).toHaveBeenCalledTimes(2);
});

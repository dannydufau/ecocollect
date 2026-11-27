import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useAuth } from "@/lib/auth-context";
import RequireRole from "./require-role";

const router = { replace: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/auth-context", () => ({ useAuth: vi.fn() }));

const setActiveRole = vi.fn();
const user = { uid: "u1" };

function signedIn(roles: string[], activeRole: string | null = roles[0] ?? null, verificationState = "verified") {
    vi.mocked(useAuth).mockReturnValue({
        user,
        roles,
        activeRole,
        loading: false,
        verificationState,
        setActiveRole,
        retryRoles: vi.fn(),
    } as never);
}

beforeEach(() => window.history.pushState({}, "", "/"));

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    sessionStorage.clear();
});

it("shows Loading while the auth state loads", () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, roles: [], activeRole: null, loading: true, setActiveRole } as never);
    render(<RequireRole role="resident">page</RequireRole>);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
});

it("sends a resident-only user away from a volunteer page to /choose-role with a reason", () => {
    signedIn(["resident"]);
    render(<RequireRole role="volunteer">page</RequireRole>);
    expect(router.replace).toHaveBeenCalledWith("/choose-role?need=volunteer");
    expect(screen.queryByText("page")).not.toBeInTheDocument();
});

it("sends an account with no roles to /login", () => {
    signedIn([]);
    render(<RequireRole role="resident">page</RequireRole>);
    expect(router.replace).toHaveBeenCalledWith("/login");
});

it("sends a signed-out visitor to /login and saves the page they wanted", () => {
    window.history.pushState({}, "", "/resident/requests/r1?from=push");
    vi.mocked(useAuth).mockReturnValue({ user: null, roles: [], activeRole: null, loading: false, setActiveRole } as never);
    render(<RequireRole role="resident">page</RequireRole>);
    expect(router.replace).toHaveBeenCalledWith("/login");
    expect(sessionStorage.getItem("returnTo")).toBe("/resident/requests/r1?from=push");
});

it("does not save a page outside the allowed list", () => {
    window.history.pushState({}, "", "/choose-role");
    vi.mocked(useAuth).mockReturnValue({ user: null, roles: [], activeRole: null, loading: false, setActiveRole } as never);
    render(<RequireRole role="resident">page</RequireRole>);
    expect(sessionStorage.getItem("returnTo")).toBeNull();
});

it("still redirects when storage throws", () => {
    window.history.pushState({}, "", "/resident/requests/r1");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.mocked(useAuth).mockReturnValue({ user: null, roles: [], activeRole: null, loading: false, setActiveRole } as never);
    render(<RequireRole role="resident">page</RequireRole>);
    expect(router.replace).toHaveBeenCalledWith("/login");
});

it("sets the page's role once when a both-roles account opens it with the other role active", () => {
    window.history.pushState({}, "", "/volunteer/x");
    signedIn(["resident", "volunteer"], "resident");
    const { rerender } = render(<RequireRole role="volunteer">page</RequireRole>);
    expect(setActiveRole).toHaveBeenCalledWith("volunteer");
    expect(screen.getByText("page")).toBeInTheDocument();

    // The header switch changes the role later, the guard must not change it back
    signedIn(["resident", "volunteer"], "resident");
    rerender(<RequireRole role="volunteer">page again</RequireRole>);
    expect(setActiveRole).toHaveBeenCalledTimes(1);
});

it("does not set the role when it already matches", () => {
    signedIn(["resident", "volunteer"], "volunteer");
    render(<RequireRole role="volunteer">page</RequireRole>);
    expect(setActiveRole).not.toHaveBeenCalled();
});

it("saves returnTo and redirects an unverified user to /verify-email", () => {
    window.history.pushState({}, "", "/resident/requests/r1");
    signedIn(["resident"], "resident", "unverified");
    render(<RequireRole role="resident">page</RequireRole>);
    expect(router.replace).toHaveBeenCalledWith("/verify-email");
    expect(sessionStorage.getItem("returnTo")).toBe("/resident/requests/r1");
    expect(screen.queryByText("page")).not.toBeInTheDocument();
});

it("shows Retry without redirecting when verification check failed", () => {
    signedIn([], null, "check-failed");
    render(<RequireRole role="resident">page</RequireRole>);
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
});

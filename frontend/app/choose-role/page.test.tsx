import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useAuth } from "@/lib/auth-context";
import RequireRole from "@/components/require-role";
import ChooseRolePage from "./page";

const router = { replace: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/auth-context", () => ({ useAuth: vi.fn() }));

const setActiveRole = vi.fn();

function signedIn(roles: string[]) {
    vi.mocked(useAuth).mockReturnValue({
        user: { uid: "u1" }, roles, activeRole: roles.length === 1 ? roles[0] : null, loading: false, setActiveRole,
    } as never);
}

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.restoreAllMocks();
    sessionStorage.clear();
});

it("shows one button per role for a both-roles account", () => {
    signedIn(["resident", "volunteer"]);
    render(<ChooseRolePage />);
    expect(screen.getByRole("heading", { name: "Continue as" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(2);
});

it("shows one button for a single-role account and does not redirect on its own", () => {
    signedIn(["resident"]);
    render(<ChooseRolePage />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Resident"]);
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
});

it("sets the chosen role and goes to its home", () => {
    signedIn(["resident", "volunteer"]);
    render(<ChooseRolePage />);
    fireEvent.click(screen.getByRole("button", { name: "Volunteer" }));
    expect(setActiveRole).toHaveBeenCalledWith("volunteer");
    expect(router.push).toHaveBeenCalledWith("/volunteer");
});

it("sends a signed-out visitor to /login", () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, roles: [], activeRole: null, loading: false, setActiveRole } as never);
    render(<ChooseRolePage />);
    expect(router.replace).toHaveBeenCalledWith("/login");
});

it("sends an account with no roles to /login", () => {
    signedIn([]);
    render(<ChooseRolePage />);
    expect(router.replace).toHaveBeenCalledWith("/login");
});

it("returns to the page saved by the guard after choosing the role", () => {
    window.history.pushState({}, "", "/resident/requests/r1");
    vi.mocked(useAuth).mockReturnValue({ user: null, roles: [], activeRole: null, loading: false, setActiveRole } as never);
    render(<RequireRole role="resident">page</RequireRole>);
    cleanup();

    signedIn(["resident"]);
    render(<ChooseRolePage />);
    fireEvent.click(screen.getByRole("button", { name: "Resident" }));
    expect(router.push).toHaveBeenCalledWith("/resident/requests/r1");
    expect(sessionStorage.getItem("returnTo")).toBeNull();
    window.history.pushState({}, "", "/");
});

it("ignores a saved volunteer page for a resident-only account", () => {
    sessionStorage.setItem("returnTo", "/volunteer/x");
    signedIn(["resident"]);
    render(<ChooseRolePage />);
    fireEvent.click(screen.getByRole("button", { name: "Resident" }));
    expect(setActiveRole).toHaveBeenCalledWith("resident");
    expect(router.push).toHaveBeenCalledWith("/resident");
    expect(sessionStorage.getItem("returnTo")).toBeNull();
});

it("switches to volunteer for a saved volunteer page when the account has both roles", () => {
    sessionStorage.setItem("returnTo", "/volunteer/x");
    signedIn(["resident", "volunteer"]);
    render(<ChooseRolePage />);
    fireEvent.click(screen.getByRole("button", { name: "Resident" }));
    expect(setActiveRole).toHaveBeenCalledWith("volunteer");
    expect(router.push).toHaveBeenCalledWith("/volunteer/x");
});

it.each(["resident", "volunteer"])("goes to a saved /ecopoints as %s", (role) => {
    sessionStorage.setItem("returnTo", "/ecopoints");
    signedIn([role]);
    render(<ChooseRolePage />);
    fireEvent.click(screen.getByRole("button"));
    expect(setActiveRole).toHaveBeenCalledWith(role);
    expect(router.push).toHaveBeenCalledWith("/ecopoints");
});

it.each(["//evil.com", "https://evil.com"])("ignores a bad saved value %s", (value) => {
    sessionStorage.setItem("returnTo", value);
    signedIn(["resident"]);
    render(<ChooseRolePage />);
    fireEvent.click(screen.getByRole("button", { name: "Resident" }));
    expect(router.push).toHaveBeenCalledWith("/resident");
    expect(sessionStorage.getItem("returnTo")).toBeNull();
});

it("still works when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    signedIn(["volunteer"]);
    render(<ChooseRolePage />);
    fireEvent.click(screen.getByRole("button", { name: "Volunteer" }));
    expect(router.push).toHaveBeenCalledWith("/volunteer");
});

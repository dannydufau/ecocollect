import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FirebaseError } from "firebase/app";
import { useAuth } from "@/lib/auth-context";
import LoginPage from "./page";

const router = { replace: vi.fn(), push: vi.fn() };
let params = new URLSearchParams();
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => params }));
vi.mock("@/lib/auth-context", () => ({ useAuth: vi.fn() }));

const signIn = vi.fn();
const signOut = vi.fn();
const retryRoles = vi.fn();

beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
        user: null,
        roles: [],
        loading: false,
        verificationState: "checking",
        signIn,
        signOut,
        retryRoles,
    } as never);
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    params = new URLSearchParams();
    sessionStorage.clear();
});

function submit() {
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.ca" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret12" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

it("shows the sign in form without a second mark and links to register and the stats", () => {
    render(<LoginPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Sign in to EcoCollect" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/register");
    expect(screen.getByRole("link", { name: "Community stats" })).toHaveAttribute("href", "/stats");
    // The header already shows the mark, so the page does not show it a second time
    expect(document.querySelector("img[src*='ecocollect-mark']")).toBeNull();
    expect(screen.getByLabelText("Email")).toBeRequired();
});

it("links to the password reset page", () => {
    render(<LoginPage />);
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");
});

it.each(["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email"])(
    "shows one message for %s and stays on the page", async (code) => {
        signIn.mockRejectedValue(new FirebaseError(code, "bad"));
        render(<LoginPage />);
        submit();
        expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
        expect(router.replace).not.toHaveBeenCalled();
        expect(router.push).not.toHaveBeenCalled();
    });

it("shows the deactivated message for a disabled account", async () => {
    signIn.mockRejectedValue(new FirebaseError("auth/user-disabled", "disabled"));
    render(<LoginPage />);
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("This account has been deactivated.");
});

it("keeps the old messages for other errors", async () => {
    signIn.mockRejectedValue(new FirebaseError("auth/too-many-requests", "slow down"));
    render(<LoginPage />);
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts. Wait a moment and try again.");
});

it.each([[["resident"]], [["resident", "volunteer"]]])("goes to /choose-role after signing in with %j", async (roles) => {
    signIn.mockResolvedValue({ user: { uid: "u1" }, status: "verified", roles, emailVerified: true });
    render(<LoginPage />);
    submit();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/choose-role"));
    expect(signIn).toHaveBeenCalledWith("a@b.ca", "secret12");
});

it("goes to /verify-email after signing in with an unverified account without signing out", async () => {
    signIn.mockResolvedValue({ user: { uid: "u1" }, status: "unverified", roles: ["resident"], emailVerified: false });
    render(<LoginPage />);
    submit();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/verify-email"));
    expect(signOut).not.toHaveBeenCalled();
});

it("offers Retry instead of a generic sign-in error when token reading fails after Firebase sign-in", async () => {
    signIn.mockResolvedValue({ user: { uid: "u1" }, status: "check-failed", roles: [], emailVerified: false });
    const { rerender } = render(<LoginPage />);
    submit();
    await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Something went wrong. Please try again.")).not.toBeInTheDocument();

    vi.mocked(useAuth).mockReturnValue({
        user: { uid: "u1" },
        roles: [],
        loading: false,
        verificationState: "check-failed",
        signIn,
        signOut,
        retryRoles,
    } as never);
    rerender(<LoginPage />);
    expect(screen.getByText(/You are signed in, but we could not verify your account status/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retryRoles).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
});

it("sends an already signed-in visitor to /choose-role", () => {
    vi.mocked(useAuth).mockReturnValue({
        user: { uid: "u1" },
        roles: ["volunteer"],
        loading: false,
        verificationState: "verified",
        signIn,
        signOut,
        retryRoles,
    } as never);
    render(<LoginPage />);
    expect(router.replace).toHaveBeenCalledWith("/choose-role");
});

it("signs out an account with no roles and says so", async () => {
    signIn.mockResolvedValue({ user: { uid: "u1" }, status: "verified", roles: [], emailVerified: true });
    render(<LoginPage />);
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("This account has no role assigned.");
    expect(signOut).toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
});

it("is busy while signing in and does not sign in twice", async () => {
    let finish: (result: { user: { uid: string }; status: "verified"; roles: string[]; emailVerified: boolean }) => void = () => {};
    signIn.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<LoginPage />);
    submit();
    const button = screen.getByRole("button", { name: "Signing in..." });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(signIn).toHaveBeenCalledTimes(1);
    finish({ user: { uid: "u1" }, status: "verified", roles: ["resident"], emailVerified: true });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/choose-role"));
});

it("leaves returnTo for the role page", async () => {
    sessionStorage.setItem("returnTo", "/resident/requests/r1");
    signIn.mockResolvedValue({ user: { uid: "u1" }, status: "verified", roles: ["resident"], emailVerified: true });
    render(<LoginPage />);
    submit();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/choose-role"));
    expect(sessionStorage.getItem("returnTo")).toBe("/resident/requests/r1");
});

it("asks to sign in again when the session expired", () => {
    params = new URLSearchParams("expired=1");
    render(<LoginPage />);
    expect(screen.getByRole("status")).toHaveTextContent("Please sign in again.");
});

it("shows no expired notice without ?expired", () => {
    render(<LoginPage />);
    expect(screen.queryByText("Please sign in again.")).not.toBeInTheDocument();
});

it("shows and hides the password with a toggle button", () => {
    render(<LoginPage />);
    const field = screen.getByLabelText("Password");
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(toggle.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    fireEvent.click(toggle);
    expect(field).toHaveAttribute("type", "text");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(toggle);
    expect(field).toHaveAttribute("type", "password");
    expect(toggle).toHaveAttribute("aria-pressed", "false");
});

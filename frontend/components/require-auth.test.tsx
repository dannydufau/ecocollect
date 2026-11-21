import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useAuth } from "@/lib/auth-context";
import { takeReturnTo } from "@/lib/return-to";
import RequireAuth from "./require-auth";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/auth-context", () => ({ useAuth: vi.fn() }));

function show(auth: { user: unknown; loading: boolean }) {
    vi.mocked(useAuth).mockReturnValue(auth as never);
    render(<RequireAuth><p>Secret page</p></RequireAuth>);
}

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    sessionStorage.clear();
    window.history.pushState({}, "", "/");
});

it.each(["/profile", "/ecopoints", "/notifications?page=2"])("saves %s and sends a signed-out visitor to /login", (path) => {
    window.history.pushState({}, "", path);
    show({ user: null, loading: false });
    expect(takeReturnTo()).toBe(path);
    expect(router.replace).toHaveBeenCalledWith("/login");
    expect(screen.queryByText("Secret page")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
});

it("shows the children to a signed-in user without a redirect", () => {
    show({ user: { uid: "u1" }, loading: false });
    expect(screen.getByText("Secret page")).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
});

it("shows a spinner, no children and no redirect while auth loads", () => {
    show({ user: null, loading: true });
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Secret page")).not.toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
});

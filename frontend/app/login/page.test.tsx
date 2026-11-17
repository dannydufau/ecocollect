import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import LoginPage from "./page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("firebase/auth", () => ({ signInWithEmailAndPassword: vi.fn(), signOut: vi.fn() }));
vi.mock("firebase/app", () => ({ FirebaseError: class extends Error {} }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null, roles: [], loading: false }) }));

afterEach(cleanup);

it("shows the sign in form with the mark and links to register and the stats", () => {
    render(<LoginPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Sign in to EcoCollect" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/register");
    expect(screen.getByRole("link", { name: "Community stats" })).toHaveAttribute("href", "/stats");
    expect(document.querySelector("img[src*='ecocollect-mark']")).not.toBeNull();
});

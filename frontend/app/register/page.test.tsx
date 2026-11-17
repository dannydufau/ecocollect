import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import RegisterPage from "./page";

afterEach(cleanup);

it("shows the form and a link to sign in", () => {
    render(<RegisterPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Create your account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Already have an account? Sign in" })).toHaveAttribute("href", "/login");
});

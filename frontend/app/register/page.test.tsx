import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { renderWithClient } from "@/test/utils";
import RegisterPage from "./page";

const router = { replace: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/auth-context", () => ({ useAuth: vi.fn() }));
vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("@/lib/api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/api")>()),
    api: { get: vi.fn(), post: vi.fn() },
}));

const signIn = vi.fn();
const terms = (id: string) => ({ termsDocumentId: id, content: "Some terms", publishedAt: "2026-11-01T00:00:00.000Z" });
const termsBox = "I have read and accept the terms and safety guidelines";
const conflict = (code: string) => new ApiError(409, { error: { code, message: code } });

beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ user: null, roles: [], loading: false, signIn } as never);
    vi.mocked(api.get).mockResolvedValue(terms("terms_3"));
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

function type(label: string, value: string) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function fillAbout() {
    type("First name", " Riley ");
    type("Last name", "Resident");
    type("Date of birth", "1995-03-14");
    type("Public name", "Riley R.");
    type("Username", "Riley_1");
    type("Email", "riley@example.com ");
    type("Password", "secret1");
}

function fillResident() {
    fillAbout();
    fireEvent.click(screen.getByRole("radio", { name: "Request pickups (Resident)" }));
    type("Street", "123 4 Ave SW");
    type("Postal code", "t2p 1j9");
}

async function acceptTerms() {
    fireEvent.click(await screen.findByRole("checkbox", { name: termsBox }));
}

const submit = () => fireEvent.click(screen.getByRole("button", { name: "Create account" }));

it("shows the form, a link to sign in and the logo", async () => {
    renderWithClient(<RegisterPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Create your account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Already have an account? Sign in" })).toHaveAttribute("href", "/login");
    expect(document.querySelector("img[src*='ecocollect-mark']")).not.toBeNull();
    await screen.findByRole("checkbox", { name: termsBox });
});

it("says why submit is disabled until the terms are accepted", async () => {
    renderWithClient(<RegisterPage />);
    const button = screen.getByRole("button", { name: "Create account" });
    expect(button).toHaveAccessibleDescription("Accept the terms above to continue.");
    await acceptTerms();
    expect(button).not.toHaveAccessibleDescription();
    expect(screen.queryByText("Accept the terms above to continue.")).not.toBeInTheDocument();
});

it("keeps submit disabled until the terms are accepted", async () => {
    renderWithClient(<RegisterPage />);
    expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();
    await acceptTerms();
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
});

it("posts a resident account with the terms, signs in and goes to /choose-role", async () => {
    vi.mocked(api.post).mockResolvedValue({ accountId: "riley_1", roles: ["resident"] });
    signIn.mockResolvedValue(["resident"]);
    renderWithClient(<RegisterPage />);
    fillResident();
    await acceptTerms();
    submit();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/choose-role"));
    expect(api.post).toHaveBeenCalledWith("/api/accounts", {
        username: "riley_1", email: "riley@example.com", password: "secret1", firstName: "Riley", lastName: "Resident",
        publicName: "Riley R.", dateOfBirth: "1995-03-14", role: "resident",
        address: { street: "123 4 Ave SW", postalCode: "T2P1J9" }, termsDocumentId: "terms_3",
    });
    expect(signIn).toHaveBeenCalledWith("riley@example.com", "secret1");
});

it("posts a volunteer account with only the filled postal codes", async () => {
    vi.mocked(api.post).mockResolvedValue({ accountId: "riley_1", roles: ["volunteer"] });
    signIn.mockResolvedValue(["volunteer"]);
    renderWithClient(<RegisterPage />);
    fillAbout();
    fireEvent.click(screen.getByRole("radio", { name: "Collect and deliver items (Volunteer)" }));
    fireEvent.click(screen.getByRole("button", { name: "Add postal code" }));
    fireEvent.click(screen.getByRole("button", { name: "Add postal code" }));
    type("Postal code 1", "t3a 0b1");
    await acceptTerms();
    submit();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/choose-role"));
    expect(api.post).toHaveBeenCalledWith("/api/accounts", {
        username: "riley_1", email: "riley@example.com", password: "secret1", firstName: "Riley", lastName: "Resident",
        publicName: "Riley R.", dateOfBirth: "1995-03-14", role: "volunteer",
        preferredPostalCodes: ["T3A0B1"], termsDocumentId: "terms_3",
    });
});

it.each([["username_taken", "Username", "This username is already taken."], ["email_taken", "Email", "An account with this email already exists."]])(
    "shows %s under %s and clears it on edit", async (code, label, message) => {
        vi.mocked(api.post).mockRejectedValue(conflict(code));
        renderWithClient(<RegisterPage />);
        fillResident();
        await acceptTerms();
        submit();
        await waitFor(() => expect(screen.getByLabelText(label)).toHaveAccessibleDescription(expect.stringContaining(message)));
        expect(screen.getByLabelText(label)).toHaveAttribute("aria-invalid", "true");
        type(label, "other");
        expect(screen.queryByText(message)).not.toBeInTheDocument();
        expect(signIn).not.toHaveBeenCalled();
    });

it("shows 400 field errors under their inputs", async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError(400, {
        error: { code: "validation_error", message: "Check", details: { fields: { "address.postalCode": "Not a Calgary code." } } },
    }));
    renderWithClient(<RegisterPage />);
    fillResident();
    await acceptTerms();
    submit();
    await waitFor(() => expect(screen.getByLabelText("Postal code")).toHaveAccessibleDescription(expect.stringContaining("Not a Calgary code.")));
});

it("also shows the alert when a 400 names a field the form does not have", async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError(400, {
        error: { code: "validation_error", message: "Check", details: { fields: { termsDocumentId: "Not valid." } } },
    }));
    renderWithClient(<RegisterPage />);
    fillResident();
    await acceptTerms();
    submit();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
});

it("sends a signed-in user to /choose-role", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { uid: "u1" }, roles: ["resident"], loading: false, signIn } as never);
    renderWithClient(<RegisterPage />);
    expect(router.replace).toHaveBeenCalledWith("/choose-role");
});

it("reloads the terms and asks again when they are outdated", async () => {
    vi.mocked(api.post).mockRejectedValue(conflict("terms_outdated"));
    renderWithClient(<RegisterPage />);
    fillResident();
    await acceptTerms();
    vi.mocked(api.get).mockResolvedValue(terms("terms_4"));
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("The terms have changed. Please read and accept them again.");
    await waitFor(() => expect(screen.getByRole("checkbox", { name: termsBox })).not.toBeChecked());
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Create account" })).toBeDisabled();
});

it("shows a plain message for other errors", async () => {
    vi.mocked(api.post).mockRejectedValue(new TypeError("Failed to fetch"));
    renderWithClient(<RegisterPage />);
    fillResident();
    await acceptTerms();
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not reach the server.");
});

it("says the account exists when signing in fails, and does not post again", async () => {
    vi.mocked(api.post).mockResolvedValue({ accountId: "riley_1", roles: ["resident"] });
    signIn.mockRejectedValue(new Error("network"));
    renderWithClient(<RegisterPage />);
    fillResident();
    await acceptTerms();
    submit();
    expect(await screen.findByText(/Your account was created, but we could not sign you in/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to sign in" })).toHaveAttribute("href", "/login");
    submit();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
});

it("does not post twice while busy", async () => {
    vi.mocked(api.post).mockReturnValue(new Promise(() => {}));
    renderWithClient(<RegisterPage />);
    fillResident();
    await acceptTerms();
    submit();
    expect(screen.getByRole("button", { name: "Creating account..." })).toBeDisabled();
    fireEvent.submit(screen.getByRole("button", { name: "Creating account..." }).closest("form")!);
    expect(api.post).toHaveBeenCalledTimes(1);
});

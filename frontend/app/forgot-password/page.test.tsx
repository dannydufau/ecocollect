import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FirebaseError } from "firebase/app";
import { sendPasswordResetEmail } from "firebase/auth";
import ForgotPasswordPage from "./page";

const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path) }));
vi.mock("@/lib/firebase", () => ({ auth: { name: "auth" } }));
vi.mock("firebase/auth", () => ({ sendPasswordResetEmail: vi.fn() }));

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
});

function submit(email = "a@b.ca") {
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
}

it("asks for an email and links back to sign in", () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Reset your password" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("Email")).toBeRequired();
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute("href", "/login");
});

it("sends the reset email once and says a link was sent, without saying whether the account exists", async () => {
    vi.mocked(sendPasswordResetEmail).mockResolvedValue();
    render(<ForgotPasswordPage />);
    submit("  a@b.ca ");
    expect(await screen.findByRole("status")).toHaveTextContent("If an account uses that email, we have sent a reset link.");
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmail).toHaveBeenCalledWith({ name: "auth" }, "a@b.ca");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

// The browser already stops text like "not-an-email". "a@b" passes its check and Firebase still refuses it.
it("shows what is wrong with an email Firebase refuses and does not say a link was sent", async () => {
    vi.mocked(sendPasswordResetEmail).mockRejectedValue(new FirebaseError("auth/invalid-email", "bad"));
    render(<ForgotPasswordPage />);
    submit("a@b");
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid email.");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it.each([
    ["auth/too-many-requests", "Too many attempts. Wait a moment and try again."],
    ["auth/network-request-failed", "Network error. Check your connection."],
    ["auth/internal-error", "Something went wrong. Please try again."],
])("shows a message for %s", async (code, message) => {
    vi.mocked(sendPasswordResetEmail).mockRejectedValue(new FirebaseError(code, "failed"));
    render(<ForgotPasswordPage />);
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
});

it("shows a message for an error that is not from Firebase", async () => {
    vi.mocked(sendPasswordResetEmail).mockRejectedValue(new Error("boom"));
    render(<ForgotPasswordPage />);
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
});

it("is busy while sending and does not send twice", async () => {
    let finish: () => void = () => {};
    vi.mocked(sendPasswordResetEmail).mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    render(<ForgotPasswordPage />);
    submit();
    const button = screen.getByRole("button", { name: "Sending..." });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    finish();
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeEnabled();
});

it("drops an old error when the next try works", async () => {
    vi.mocked(sendPasswordResetEmail)
        .mockRejectedValueOnce(new FirebaseError("auth/network-request-failed", "offline"))
        .mockResolvedValueOnce();
    render(<ForgotPasswordPage />);
    submit();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("goes to the demo page in a demo build, which has no passwords", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO", "true");
    vi.resetModules();
    const { default: DemoBuildPage } = await import("./page");
    render(<DemoBuildPage />);
    await waitFor(() => expect(redirect).toHaveBeenCalledWith("/demo"));
});

it("stays on the page in a normal build", () => {
    render(<ForgotPasswordPage />);
    expect(redirect).not.toHaveBeenCalled();
});

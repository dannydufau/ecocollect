import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FirebaseError } from "firebase/app";
import { useAuth } from "@/lib/auth-context";
import VerifyEmailPage from "./page";

const router = { replace: vi.fn(), push: vi.fn() };
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => searchParams }));
vi.mock("@/lib/auth-context", () => ({ useAuth: vi.fn() }));

const sendVerificationEmail = vi.fn();
const recheckVerification = vi.fn();
const retryRoles = vi.fn();
const signOut = vi.fn();

function mockAuth(overrides: Record<string, unknown> = {}) {
    vi.mocked(useAuth).mockReturnValue({
        user: { uid: "u1", email: "riley@example.com" },
        roles: ["resident"],
        activeRole: "resident",
        loading: false,
        rolesError: false,
        verificationState: "unverified",
        sendVerificationEmail,
        recheckVerification,
        retryRoles,
        signOut,
        ...overrides,
    } as never);
}

beforeEach(() => {
    searchParams = new URLSearchParams();
    sendVerificationEmail.mockReset().mockResolvedValue(undefined);
    recheckVerification.mockReset().mockResolvedValue("unverified");
    retryRoles.mockReset().mockResolvedValue(undefined);
    signOut.mockReset().mockResolvedValue(undefined);
    mockAuth();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
});

it("shows the account email, inbox/spam guidance, and actions without claiming an email was sent on ?sendError=1", () => {
    searchParams = new URLSearchParams("sendError=1");
    render(<VerifyEmailPage />);
    expect(screen.getByRole("heading", { name: "Verify your email" })).toBeInTheDocument();
    expect(screen.getByText("riley@example.com")).toBeInTheDocument();
    expect(screen.getByText(/inbox/i)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/could not send the verification email yet/i);
    expect(screen.queryByText(/We sent a verification link/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send again" })).toBeEnabled();
});

it("starts a 60-second cooldown after Send again succeeds and surfaces rate-limit errors", async () => {
    vi.useFakeTimers();
    render(<VerifyEmailPage />);
    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Send again" }));
    });
    expect(sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Send again (60s)" })).toBeDisabled();
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByRole("button", { name: "Send again" })).toBeEnabled();

    sendVerificationEmail.mockRejectedValueOnce(new FirebaseError("auth/too-many-requests", "too many"));
    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Send again" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/Too many verification emails sent/i);
});

it("routes to /choose-role when cross-device I've verified recheck succeeds", async () => {
    recheckVerification.mockResolvedValueOnce("verified");
    render(<VerifyEmailPage />);
    fireEvent.click(screen.getByRole("button", { name: "I’ve verified" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/choose-role"));
});

it("shows an error and stays on the page when recheck fails", async () => {
    recheckVerification.mockRejectedValueOnce(new Error("offline"));
    render(<VerifyEmailPage />);
    fireEvent.click(screen.getByRole("button", { name: "I’ve verified" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not check your verification status/i);
    expect(router.replace).not.toHaveBeenCalled();
});

it("shows Retry without redirecting when verificationState is check-failed", () => {
    mockAuth({ verificationState: "check-failed", rolesError: true });
    render(<VerifyEmailPage />);
    expect(router.replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retryRoles).toHaveBeenCalledTimes(1);
});

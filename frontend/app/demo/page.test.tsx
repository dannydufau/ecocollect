import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { signInWithCustomToken } from "firebase/auth";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import DemoPage from "./page";

// The demo page only exists in a demo build, so the flag is on before anything loads
const { router, redirect, notFound } = vi.hoisted(() => {
    process.env.NEXT_PUBLIC_DEMO = "true";
    return { router: { replace: vi.fn(), push: vi.fn() }, redirect: vi.fn(), notFound: vi.fn() };
});
vi.mock("next/navigation", () => ({ useRouter: () => router, redirect, notFound, useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/firebase", () => ({ auth: { name: "auth" } }));
vi.mock("firebase/auth", () => ({ signInWithCustomToken: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/api")>()),
    api: { post: vi.fn() },
}));

function signedOut() {
    vi.mocked(useAuth).mockReturnValue({ user: null, roles: [], loading: false, signIn: vi.fn(), signOut: vi.fn() } as never);
}
async function loginPage(flag?: string) {
    vi.stubEnv("NEXT_PUBLIC_DEMO", flag ?? "");
    vi.resetModules();
    const { default: LoginPage } = await import("../login/page");
    render(<LoginPage />);
}

beforeEach(() => {
    signedOut();
    vi.mocked(api.post).mockResolvedValue({ customToken: "token-1" });
    vi.mocked(signInWithCustomToken).mockResolvedValue({} as never);
});
afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
});

it("explains the shared demo data and links to the community stats", () => {
    render(<DemoPage />);
    expect(screen.getByText("This is a demo with sample data. Everyone shares it and it resets every night. Open a second tab to try the other role.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Community stats" })).toHaveAttribute("href", "/stats");
    expect(notFound).not.toHaveBeenCalled();
});

it("is a 404 in a normal build", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO", "");
    vi.resetModules();
    const { default: NormalBuildDemoPage } = await import("./page");
    render(<NormalBuildDemoPage />);
    expect(notFound).toHaveBeenCalled();
});

it("Start asks for a demo session and signs in with its custom token", async () => {
    render(<DemoPage />);
    fireEvent.click(screen.getByRole("button", { name: "Start demo" }));
    await waitFor(() => expect(signInWithCustomToken).toHaveBeenCalledWith({ name: "auth" }, "token-1"));
    expect(api.post).toHaveBeenCalledWith("/api/demo/session");
});

it("goes to the role page once the auth context has the account", () => {
    vi.mocked(useAuth).mockReturnValue({ user: { uid: "demo-1" }, roles: ["resident", "volunteer"], loading: false } as never);
    render(<DemoPage />);
    expect(router.replace).toHaveBeenCalledWith("/choose-role");
});

it.each([
    [429, "Too many demo sessions from your network. Try again in a minute."],
    [500, "We could not start the demo. Please try again."],
])("shows a retry message for %i", async (status, text) => {
    vi.mocked(api.post).mockRejectedValueOnce(new ApiError(status, null));
    render(<DemoPage />);
    fireEvent.click(screen.getByRole("button", { name: "Start demo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(signInWithCustomToken).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Start demo" }));
    await waitFor(() => expect(signInWithCustomToken).toHaveBeenCalledTimes(1));
});

it("keeps the normal login page without the demo flag", async () => {
    await loginPage();
    expect(screen.getByRole("heading", { name: "Sign in to EcoCollect" })).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
});

it("sends /login to /demo in a demo build", async () => {
    redirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
    await expect(loginPage("true")).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/demo");
});

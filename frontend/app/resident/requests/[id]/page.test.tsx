import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useAuth } from "@/lib/auth-context";
import ResidentLayout from "@/app/resident/layout";
import ResidentRequestPage from "./page";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ homeFor: () => "/volunteer" }));
vi.mock("@/components/resident/request-detail", () => ({
    default: ({ requestId, rescheduled }: { requestId: string; rescheduled?: boolean }) => <p>Details for {requestId}{rescheduled ? " (rescheduled)" : ""}</p>,
}));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("awaits the dynamic ID and displays the detail page to a resident", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { uid: "resident1" } as NonNullable<ReturnType<typeof useAuth>["user"]>, roles: ["resident"], activeRole: "resident", setActiveRole: vi.fn(), loading: false } as Partial<ReturnType<typeof useAuth>> as ReturnType<typeof useAuth>);
    render(<ResidentLayout>{await ResidentRequestPage({ params: Promise.resolve({ id: "request-123" }), searchParams: Promise.resolve({}) })}</ResidentLayout>);
    expect(screen.getByText("Details for request-123")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
});
it("does not expose details to a volunteer-only account", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { uid: "volunteer1" } as NonNullable<ReturnType<typeof useAuth>["user"]>, roles: ["volunteer"], loading: false } as Partial<ReturnType<typeof useAuth>> as ReturnType<typeof useAuth>);
    render(<ResidentLayout>{await ResidentRequestPage({ params: Promise.resolve({ id: "r1" }), searchParams: Promise.resolve({}) })}</ResidentLayout>);
    expect(screen.queryByText("Details for r1")).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith("/choose-role?need=resident");
});
it("redirects signed-out visitors to login", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, roles: [], loading: false } as Partial<ReturnType<typeof useAuth>> as ReturnType<typeof useAuth>);
    render(<ResidentLayout>{await ResidentRequestPage({ params: Promise.resolve({ id: "r1" }), searchParams: Promise.resolve({}) })}</ResidentLayout>);
    expect(screen.queryByText("Details for r1")).not.toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith("/login");
});
it("tells the detail it was opened after a reschedule", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: { uid: "resident1" } as NonNullable<ReturnType<typeof useAuth>["user"]>, roles: ["resident"], activeRole: "resident", setActiveRole: vi.fn(), loading: false } as Partial<ReturnType<typeof useAuth>> as ReturnType<typeof useAuth>);
    render(<ResidentLayout>{await ResidentRequestPage({ params: Promise.resolve({ id: "r2" }), searchParams: Promise.resolve({ rescheduled: "1" }) })}</ResidentLayout>);
    expect(screen.getByText("Details for r2 (rescheduled)")).toBeInTheDocument();
});

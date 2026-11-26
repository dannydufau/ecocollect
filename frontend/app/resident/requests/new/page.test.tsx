import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useAuth } from "@/lib/auth-context";
import ResidentLayout from "@/app/resident/layout";
import NewRequestPage from "./page";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ homeFor: () => "/volunteer" }));
vi.mock("@/components/resident/new-request-form", () => ({ default: () => <div>Request form</div> }));

afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe("new request access", () => {
    it("shows the form to residents", () => {
        vi.mocked(useAuth).mockReturnValue({ user: { uid: "resident" } as NonNullable<ReturnType<typeof useAuth>["user"]>, roles: ["resident"], activeRole: "resident", setActiveRole: vi.fn(), loading: false } as Partial<ReturnType<typeof useAuth>> as ReturnType<typeof useAuth>);
        render(<ResidentLayout><NewRequestPage /></ResidentLayout>);
        expect(screen.getByText("Request form")).toBeInTheDocument();
        expect(replace).not.toHaveBeenCalled();
    });
    it("redirects volunteers without exposing the form", () => {
        vi.mocked(useAuth).mockReturnValue({ user: { uid: "volunteer" } as NonNullable<ReturnType<typeof useAuth>["user"]>, roles: ["volunteer"], loading: false } as ReturnType<typeof useAuth>);
        render(<ResidentLayout><NewRequestPage /></ResidentLayout>);
        expect(screen.queryByText("Request form")).not.toBeInTheDocument();
        expect(replace).toHaveBeenCalledWith("/choose-role?need=resident");
    });
    it("redirects signed-out users to login", () => {
        vi.mocked(useAuth).mockReturnValue({ user: null, roles: [], activeRole: null, loading: false } as Partial<ReturnType<typeof useAuth>> as ReturnType<typeof useAuth>);
        render(<ResidentLayout><NewRequestPage /></ResidentLayout>);
        expect(screen.queryByText("Request form")).not.toBeInTheDocument();
        expect(replace).toHaveBeenCalledWith("/login");
    });
});

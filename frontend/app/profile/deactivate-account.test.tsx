import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { renderWithClient } from "@/test/utils";
import { DeactivateAccount } from "./deactivate-account";

const router = { replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/firebase", () => ({ auth: {} }));
vi.mock("@/lib/auth-context", () => ({ useAuth: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/api")>()),
    api: { delete: vi.fn() },
}));
HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };

let calls: string[];
let signOut: ReturnType<typeof vi.fn>;

function openDialog() {
    renderWithClient(<DeactivateAccount />);
    fireEvent.click(screen.getByRole("button", { name: "Deactivate account" }));
    return screen.getByRole("dialog");
}

beforeEach(() => {
    calls = [];
    signOut = vi.fn(async () => { calls.push("signOut"); });
    vi.mocked(useAuth).mockReturnValue({ signOut } as never);
    vi.mocked(api.delete).mockImplementation(async (path: string) => { calls.push(`DELETE ${path}`); });
    router.replace.mockImplementation((path: string) => { calls.push(`replace ${path}`); });
});
afterEach(() => {
    cleanup();
    vi.resetAllMocks();
});

it("says the history is kept and that it cannot be undone", () => {
    const dialog = openDialog();
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveTextContent("Your history is kept. This can't be undone.");
});

it("deletes the profile, then signs out without the server calls, then goes to the login page", async () => {
    const dialog = openDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Deactivate account" }));
    await waitFor(() => expect(calls).toEqual(["DELETE /api/profile", "signOut", "replace /login"]));
    expect(signOut).toHaveBeenCalledWith({ skipServer: true });
});

it("calls nothing when the dialog is cancelled", () => {
    const dialog = openDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep account" }));
    expect(dialog).not.toHaveAttribute("open");
    expect(calls).toEqual([]);
});

it("shows the active_work sentence, keeps the dialog open and does not sign out", async () => {
    vi.mocked(api.delete).mockRejectedValue(new ApiError(409, { error: { code: "active_work", message: "busy" } }));
    const dialog = openDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Deactivate account" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("You can't deactivate your account while you have requests or pickups in progress.");
    expect(dialog).toHaveAttribute("open");
    expect(signOut).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
});

it("shows a plain message for other errors and stays open", async () => {
    vi.mocked(api.delete).mockRejectedValue(new TypeError("Failed to fetch"));
    const dialog = openDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Deactivate account" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("We could not reach the server.");
    expect(dialog).toHaveAttribute("open");
    expect(signOut).not.toHaveBeenCalled();
});

it("does not send twice when confirmed again while busy", async () => {
    let finish = () => {};
    vi.mocked(api.delete).mockReturnValue(new Promise((resolve) => { finish = () => resolve(undefined); }));
    const dialog = openDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Deactivate account" }));
    const busy = await within(dialog).findByRole("button", { name: "Deactivating..." });
    expect(busy).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Keep account" })).toBeDisabled();
    fireEvent.click(busy);
    expect(api.delete).toHaveBeenCalledTimes(1);
    await act(async () => finish());
});

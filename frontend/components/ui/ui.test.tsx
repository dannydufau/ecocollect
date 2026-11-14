import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Alert, ConfirmDialog, StatusBadge } from "./index";
afterEach(() => {
    cleanup();
});

// jsdom does not implement the native dialog methods.
HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };

describe("UI components", () => {
    it.each(["Open", "Assigned", "Collected", "Delivered", "Cancelled", "Expired", "Missed"] as const)(
        "shows the %s badge with a symbol", (status) => {
            const { container } = render(<StatusBadge status={status} />);
            expect(screen.getByText(status)).toBeTruthy();
            expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBeTruthy();
        },
    );

    it("uses alert for errors and status for information", () => {
        const { rerender } = render(<Alert variant="error">Problem</Alert>);
        expect(screen.getByRole("alert").textContent).toContain("Problem");
        rerender(<Alert variant="info">Ready</Alert>);
        expect(screen.getByRole("status").textContent).toContain("Ready");
    });

    it("shows children and errors and calls dialog actions", () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        render(<ConfirmDialog open title="Confirm" confirmLabel="Yes" error="Try again"
            onConfirm={onConfirm} onCancel={onCancel}>Are you sure?</ConfirmDialog>);
        expect(screen.getByText("Are you sure?")).toBeTruthy();
        expect(screen.getByRole("alert").textContent).toContain("Try again");
        fireEvent.click(screen.getByRole("button", { name: "Yes" }));
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onConfirm).toHaveBeenCalledOnce();
        expect(onCancel).toHaveBeenCalledOnce();
    });

    it.each([{ busy: true }, { confirmDisabled: true }])("disables confirm: %o", (flags) => {
        render(<ConfirmDialog open title="Confirm" confirmLabel="Yes" onConfirm={vi.fn()}
            onCancel={vi.fn()} {...flags}>Text</ConfirmDialog>);
        expect((screen.getByRole("button", { name: "Yes" }) as HTMLButtonElement).disabled).toBe(true);
    });
});

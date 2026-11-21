import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { Alert, ConfirmDialog, PageLoading, Spinner, StatusBadge } from "./index";
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

    it("can name the cancel button, so Cancel is not misread as cancelling a request", () => {
        const onCancel = vi.fn();
        render(<ConfirmDialog open title="Cancel this request?" confirmLabel="Cancel request" cancelLabel="Keep request"
            onConfirm={vi.fn()} onCancel={onCancel}>Text</ConfirmDialog>);
        expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Keep request" }));
        expect(onCancel).toHaveBeenCalledOnce();
    });

    it.each([{ busy: true }, { confirmDisabled: true }])("disables confirm: %o", (flags) => {
        render(<ConfirmDialog open title="Confirm" confirmLabel="Yes" onConfirm={vi.fn()}
            onCancel={vi.fn()} {...flags}>Text</ConfirmDialog>);
        expect((screen.getByRole("button", { name: "Yes" }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("gives each dialog its own accessible heading", () => {
        render(<>
            <ConfirmDialog open title="Cancel pickup" confirmLabel="Confirm cancel"
                onConfirm={vi.fn()} onCancel={vi.fn()}>Cancel this pickup?</ConfirmDialog>
            <ConfirmDialog open title="Record delivery" confirmLabel="Confirm delivery"
                onConfirm={vi.fn()} onCancel={vi.fn()}>Record this delivery?</ConfirmDialog>
        </>);
        const cancelDialog = screen.getByRole("dialog", { name: "Cancel pickup" });
        const deliveryDialog = screen.getByRole("dialog", { name: "Record delivery" });
        expect(cancelDialog.getAttribute("aria-labelledby")).not.toBe(deliveryDialog.getAttribute("aria-labelledby"));
    });

    it("handles Escape through onCancel and prevents dismissal while busy", () => {
        const onCancel = vi.fn();
        const { rerender } = render(<ConfirmDialog open title="Confirm" confirmLabel="Yes"
            onConfirm={vi.fn()} onCancel={onCancel}>Text</ConfirmDialog>);
        fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
        expect(onCancel).toHaveBeenCalledOnce();
        rerender(<ConfirmDialog open busy title="Confirm" confirmLabel="Yes"
            onConfirm={vi.fn()} onCancel={onCancel}>Text</ConfirmDialog>);
        fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
        expect(onCancel).toHaveBeenCalledOnce();
    });

    it("mounts children only while open and cleans them up on close", () => {
        const onMount = vi.fn();
        const onUnmount = vi.fn();
        function DialogContent() {
            useEffect(() => {
                onMount();
                return onUnmount;
            }, []);
            return <p>Facility picker</p>;
        }
        const props = {
            title: "Record delivery",
            confirmLabel: "Save",
            onConfirm: vi.fn(),
            onCancel: vi.fn(),
            children: <DialogContent />,
        };
        const { rerender } = render(<ConfirmDialog {...props} open={false} />);
        expect(onMount).not.toHaveBeenCalled();
        expect(screen.queryByText("Facility picker")).toBeNull();

        rerender(<ConfirmDialog {...props} open />);
        expect(onMount).toHaveBeenCalledOnce();
        expect(screen.getByText("Facility picker")).toBeInTheDocument();

        rerender(<ConfirmDialog {...props} open={false} />);
        expect(onUnmount).toHaveBeenCalledOnce();
        expect(screen.queryByText("Facility picker")).toBeNull();

        rerender(<ConfirmDialog {...props} open />);
        expect(onMount).toHaveBeenCalledTimes(2);
        expect(screen.getByText("Facility picker")).toBeInTheDocument();
    });
});

it("PageLoading centres one status spinner in the space it gets", () => {
    const { container } = render(<PageLoading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading...");
    expect(container.firstChild).toHaveClass("flex-1", "items-center", "justify-center");
});

it("Spinner stops spinning for people who ask for less motion", () => {
    render(<Spinner />);
    expect(screen.getByRole("status").querySelector("[aria-hidden=true]")).toHaveClass("motion-reduce:animate-none");
});

it.each([[undefined, "max-w-md"], ["md", "max-w-md"], ["lg", "max-w-xl"]] as const)("ConfirmDialog with size %s uses %s", (size, width) => {
    const { container } = render(<ConfirmDialog open={false} size={size} title="T" confirmLabel="OK" onConfirm={vi.fn()} onCancel={vi.fn()}>Body</ConfirmDialog>);
    expect(container.querySelector("dialog")).toHaveClass(width);
});

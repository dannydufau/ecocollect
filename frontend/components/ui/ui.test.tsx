import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { Alert, Button, ConfirmDialog, LoadingRegion, PageLoading, Spinner, StatusBadge } from "./index";
import { buttonClass } from "./button";
import { AlertIcon, CheckIcon, InfoIcon, WarningIcon } from "./icons";
import { card, clickableCard, input, linkButton, panel, secondaryLinkButton, select, textarea } from "./styles";
afterEach(() => {
    cleanup();
});

// jsdom does not implement the native dialog methods.
HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };

describe("UI components", () => {
    it.each(["Open", "Assigned", "Collected", "Delivered", "Cancelled", "Expired", "Missed"] as const)(
        "shows the %s badge with an icon and its word", (status) => {
            const { container } = render(<StatusBadge status={status} />);
            expect(screen.getByText(status)).toBeTruthy();
            expect(container.querySelector("svg[aria-hidden=true]")).not.toBeNull();
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

it.each(["Active", "Cancelled by me", "Cancelled by resident"] as const)("StatusBadge shows the assignment status %s with an icon and its word", status => {
    render(<StatusBadge status={status} />);
    const badge = screen.getByText(status);
    expect(badge.querySelector("svg[aria-hidden=true]")).not.toBeNull();
});

it("StatusBadge draws a different shape for each kind of status, and no text symbol", () => {
    const statuses = ["Open", "Assigned", "Collected", "Delivered", "Cancelled", "Expired", "Missed", "Active", "Cancelled by me", "Cancelled by resident"] as const;
    const shapes = statuses.map(status => {
        const { container, unmount } = render(<StatusBadge status={status} />);
        const svg = container.querySelector("svg")!;
        // The name stays the visible word, with no character from the icon in it
        expect(container.firstElementChild!.textContent).toBe(status);
        unmount();
        return svg.innerHTML;
    });
    // Assigned and Active, and the three cancelled ones, share a shape on purpose
    expect(new Set(shapes).size).toBe(7);
});

it.each([[undefined, "max-w-md"], ["md", "max-w-md"], ["lg", "max-w-xl"]] as const)("ConfirmDialog with size %s uses %s", (size, width) => {
    const { container } = render(<ConfirmDialog open={false} size={size} title="T" confirmLabel="OK" onConfirm={vi.fn()} onCancel={vi.fn()}>Body</ConfirmDialog>);
    expect(container.querySelector("dialog")).toHaveClass(width);
});

it("Button has a ghost variant and a small size, and keeps 44px by default", () => {
    render(<><Button variant="ghost" size="sm">Small</Button><Button>Normal</Button></>);
    const small = screen.getByRole("button", { name: "Small" });
    expect(small).toHaveClass("min-h-9", "text-text", "not-disabled:hover:bg-text/10");
    expect(small).not.toHaveClass("min-h-11", "bg-accent");
    expect(screen.getByRole("button", { name: "Normal" })).toHaveClass("min-h-11");
});

it("Button shows a hidden spinner while busy and keeps aria-busy", () => {
    const { rerender } = render(<Button busy busyLabel="Saving...">Save</Button>);
    const button = screen.getByRole("button", { name: "Saving..." });
    expect(button).toHaveAttribute("aria-busy", "true");
    const spinner = button.querySelector("[aria-hidden=true]");
    expect(spinner).toHaveClass("animate-spin", "motion-reduce:animate-none");
    rerender(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" }).querySelector("[aria-hidden=true]")).toBeNull();
});

it.each([
    ["error", AlertIcon, "alert", "Error."], ["success", CheckIcon, "status", "Done."],
    ["warning", WarningIcon, "status", "Heads up."], ["info", InfoIcon, "status", "Note."],
] as const)("Alert %s has its icon, role and lead word", (variant, Icon, role, lead) => {
    const { container } = render(<Alert variant={variant}>Message</Alert>);
    const icon = container.querySelector("svg")!;
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon.innerHTML).toBe(render(<Icon />).container.querySelector("svg")!.innerHTML);
    expect(screen.getByRole(role)).toHaveTextContent(`${lead} Message`);
    expect(container.firstChild).toHaveClass("border");
});

it("Alert only has a Dismiss button with onDismiss, outside the live region", () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<Alert variant="success">Saved</Alert>);
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
    rerender(<Alert variant="success" onDismiss={onDismiss}>Saved</Alert>);
    const dismiss = screen.getByRole("button", { name: "Dismiss" });
    expect(screen.getByRole("status")).not.toContainElement(dismiss);
    fireEvent.click(dismiss);
    expect(onDismiss).toHaveBeenCalledOnce();
});

it("ConfirmDialog rises in and Alert fades in", () => {
    const { container } = render(<><ConfirmDialog open title="T" confirmLabel="OK" onConfirm={vi.fn()} onCancel={vi.fn()}>Body</ConfirmDialog><Alert variant="info">Hi</Alert></>);
    expect(container.querySelector("dialog")).toHaveClass("rise-in");
    expect(screen.getByRole("status").parentElement).toHaveClass("fade-in");
});

it.each([[linkButton, "primary"], [secondaryLinkButton, "secondary"]] as const)("a link button carries every class of the %s Button", (link, variant) => {
    expect(link.split(" ")).toEqual(expect.arrayContaining(buttonClass(variant).split(" ")));
});

it.each(["primary", "secondary", "danger", "danger-outline", "ghost"] as const)("the %s button changes on hover and press only when it is not disabled", variant => {
    for (const name of buttonClass(variant).split(" ")) expect(name).not.toMatch(/^(hover|active|motion-safe:active):/);
    expect(buttonClass(variant)).toMatch(/not-disabled:hover:/);
    expect(buttonClass(variant)).toMatch(/motion-safe:not-disabled:active:scale-\[0.985\]/);
});

it("a clickable card goes back to its resting shadow when pressed, and is never scaled", () => {
    expect(clickableCard).toContain("hover:shadow-hover");
    expect(clickableCard).toContain("active:shadow-rest");
    expect(clickableCard).not.toContain("scale");
});

it.each([["input", input], ["textarea", textarea], ["select", select]])("the %s style has a raised fill and a look for focus, invalid, disabled and read-only", (_, style) => {
    expect(style.split(" ")).toEqual(expect.arrayContaining([
        "bg-surface-elevated", "focus:border-accent-700", "aria-invalid:border-danger", "aria-invalid:ring-1", "aria-invalid:ring-danger",
        "disabled:bg-surface", "disabled:text-text-muted", "disabled:cursor-not-allowed", "[&[readonly]]:bg-surface",
    ]));
    expect(style).not.toMatch(/bg-white|bg-neutral-100/);
});

it("only the select style draws its own chevron", () => {
    expect(select.split(" ")).toContain("select-chevron");
    expect(input.split(" ")).not.toContain("select-chevron");
});

it("LoadingRegion keeps a minimum height around a labelled spinner, so the page does not jump", () => {
    render(<LoadingRegion label="Loading stats..." />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading stats...");
    expect(status.parentElement).toHaveClass("min-h-48", "items-center", "justify-center");
    expect(status.querySelector("[aria-hidden=true]")).toHaveClass("motion-reduce:animate-none");
});

it("a card has 16px of padding on a phone and 20px from 640px, with the resting shadow only", () => {
    for (const style of [card, panel]) expect(style.split(" ")).toEqual(expect.arrayContaining(["p-4", "sm:p-5", "shadow-rest"]));
    expect(card).not.toMatch(/shadow-hover|shadow-dialog/);
});

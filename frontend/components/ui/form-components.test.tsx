import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Button, Field, FilterTabs, RequestPhoto } from "./index";

afterEach(() => {
    cleanup();
});

describe("form components", () => {
    it("disables a busy button and shows its busy label", () => {
        render(<Button busy busyLabel="Saving...">Save</Button>);
        const button = screen.getByRole("button", { name: "Saving..." });
        expect(button).toBeDisabled();
    });

    it("links a field error with aria-describedby and sets aria-invalid", () => {
        render(<Field label="Name" error="Enter a name">{(control) => <input {...control} />}</Field>);
        const input = screen.getByLabelText("Name");
        expect(input).toHaveAttribute("aria-invalid", "true");
        expect(input).toHaveAccessibleDescription("Enter a name");
    });

    it("presses only the chosen filter and calls onChange", () => {
        const onChange = vi.fn();
        render(<FilterTabs label="Status" options={["Open", "Assigned"]} value="Open" onChange={onChange} />);
        expect(screen.getByRole("button", { name: "Open" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("button", { name: "Assigned" })).toHaveAttribute("aria-pressed", "false");
        fireEvent.click(screen.getByRole("button", { name: "Assigned" }));
        expect(onChange).toHaveBeenCalledWith("Assigned");
    });

    it("refetches once and then shows the fallback text", () => {
        const refetch = vi.fn();
        render(<RequestPhoto src="/a.jpg" alt="Old laptop" refetch={refetch} />);
        fireEvent.error(screen.getByRole("img", { name: "Old laptop" }));
        fireEvent.error(screen.getByRole("img", { name: "Old laptop" }));
        expect(refetch).toHaveBeenCalledOnce();
        expect(screen.getByText("The photo is not available right now.")).toBeInTheDocument();
        expect(screen.queryByRole("img")).toBeNull();
    });

    it("has no dark mode rule in globals.css", () => {
        const css = readFileSync("app/globals.css", "utf8");
        expect(css).not.toContain("prefers-color-scheme");
    });
});

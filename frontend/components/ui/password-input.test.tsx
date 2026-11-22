import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Field } from "./field";
import { PasswordInput } from "./password-input";

afterEach(cleanup);

it("toggles the type and aria-pressed and keeps one label", async () => {
    render(<PasswordInput aria-label="Password" />);
    const field = screen.getByLabelText("Password");
    expect(field).toHaveAttribute("type", "password");
    const show = screen.getByRole("button", { name: "Show password" });
    expect(show).toHaveAttribute("aria-pressed", "false");
    expect(show).toHaveClass("size-11");
    expect(show.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    await userEvent.click(show);
    expect(field).toHaveAttribute("type", "text");
    const hide = screen.getByRole("button", { name: "Show password" });
    expect(hide).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(hide);
    expect(field).toHaveAttribute("type", "password");
});

it("can be used by keyboard", async () => {
    render(<PasswordInput aria-label="Password" />);
    await userEvent.tab();
    expect(screen.getByLabelText("Password")).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Show password" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    await userEvent.keyboard(" ");
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
});

it("forwards the input props and works inside Field", async () => {
    const onChange = vi.fn();
    render(<Field label="Password" hint="At least 6" error="Too short">
        {control => <PasswordInput {...control} value="abc" onChange={onChange} autoComplete="new-password" className="extra" />}
    </Field>);
    const field = screen.getByLabelText("Password");
    expect(field).toHaveAttribute("autocomplete", "new-password");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAccessibleDescription("At least 6 Too short");
    expect(field).toHaveValue("abc");
    expect(field).toHaveClass("extra", "pr-12");
    await userEvent.type(field, "d");
    expect(onChange).toHaveBeenCalled();
});

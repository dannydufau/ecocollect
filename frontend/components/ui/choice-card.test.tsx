import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { ChoiceCard } from "./choice-card";

afterEach(cleanup);

it.each([
    ["resident", "bg-accent-100", "ring-accent-700", "accent-100"],
    ["volunteer", "bg-accent-2-200", "ring-accent-2-700", "accent-2-100"],
] as const)("styles the %s choice card and uses a native radio", async (tone, fill, ring, hoverFill) => {
    const user = userEvent.setup();
    function Choices() {
        const [selected, setSelected] = useState("");
        return <fieldset>
            <legend>Choices</legend>
            <ChoiceCard name="choices" value="first" tone={tone} title="First" detail="Details"
                checked={selected === "first"} onChange={setSelected} />
            <ChoiceCard name="choices" value="second" tone={tone} title="Second"
                checked={selected === "second"} onChange={setSelected} />
            <ChoiceCard name="choices" value="closed" tone={tone} title="Closed"
                checked={false} onChange={setSelected} disabled />
        </fieldset>;
    }
    render(<Choices />);
    const first = screen.getByRole("radio", { name: "First Details" });
    const second = screen.getByRole("radio", { name: "Second" });
    const closed = screen.getByRole("radio", { name: "Closed" });
    const label = first.closest("label")!;
    expect(label).toHaveClass("min-h-11", "border", "border-border-strong", "bg-surface-elevated",
        `hover:bg-${hoverFill}`, `active:bg-${hoverFill}`, "has-[:focus-visible]:outline-accent-700");
    expect(label.querySelector(".opacity-0")).toBeInTheDocument();
    expect(closed).toBeDisabled();
    expect(closed.closest("label")).toHaveClass("cursor-not-allowed", "opacity-60");
    expect(closed.closest("label")).not.toHaveClass(`hover:bg-${hoverFill}`);
    await user.click(closed.closest("label")!);
    expect(closed).not.toBeChecked();

    await user.tab();
    expect(first).toHaveFocus();
    await user.keyboard(" ");
    expect(first).toBeChecked();
    expect(label).toHaveClass("border", fill, ring);
    expect(label).not.toHaveClass("border-2");
    expect(label.querySelector(".opacity-100")).toHaveClass("motion-reduce:transition-none");
    await user.keyboard("{ArrowDown}");
    expect(second).toBeChecked();
    expect(first).not.toBeChecked();
    await user.keyboard("{ArrowDown}");
    expect(closed).not.toBeChecked();
});

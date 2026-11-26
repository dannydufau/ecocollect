import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LifecycleStepper } from "./lifecycle-stepper";

afterEach(cleanup);

it("marks the current step in text and with aria-current", () => {
    render(<LifecycleStepper status="Assigned" />);
    expect(screen.getAllByRole("listitem").map(step => step.textContent)).toEqual(["Open", "Assigned (now)", "Collected", "Delivered"]);
    expect(screen.getByText(/Assigned/)).toHaveAttribute("aria-current", "step");
});

it.each(["Open", "Collected", "Delivered"] as const)("marks %s as the only current step", status => {
    render(<LifecycleStepper status={status} />);
    const steps = screen.getAllByRole("listitem");
    expect(steps).toHaveLength(4);
    expect(steps.filter(step => step.hasAttribute("aria-current"))).toEqual([screen.getByText(`${status} (now)`)]);
});

import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LifecycleStepper } from "./lifecycle-stepper";

afterEach(cleanup);

it("marks the current step in text and with aria-current", () => {
    render(<LifecycleStepper status="Assigned" />);
    expect(screen.getAllByRole("listitem").map(step => step.textContent)).toEqual(["Open", "Assigned (now)", "Collected", "Delivered"]);
    expect(screen.getByText(/Assigned/)).toHaveAttribute("aria-current", "step");
});

it.each(["Cancelled", "Expired", "Missed"] as const)("shows %s instead of the later steps", status => {
    render(<LifecycleStepper status={status} />);
    const steps = screen.getAllByRole("listitem");
    expect(steps).toHaveLength(2);
    expect(steps[1]).toHaveTextContent(status);
    expect(screen.queryByText("Delivered")).not.toBeInTheDocument();
    expect(document.querySelector("[aria-current]")).toBeNull();
});

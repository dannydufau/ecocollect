import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { RequestDetail } from "@/lib/types";
import { RequestActions, type ResidentActionRenderers } from "./request-actions";

afterEach(cleanup);

const label = {
    confirm_collected: "Confirm collected", edit: "Edit request", report_missed: "Report missed pickup",
    cancel_assignment: "Cancel assignment", cancel: "Cancel request",
} as const;
const renderers = Object.fromEntries(
    Object.entries(label).map(([action, text]) => [action, () => <button type="button">{text}</button>]),
) as ResidentActionRenderers;

function shown(allowedActions: RequestDetail["allowedActions"]) {
    cleanup();
    render(<RequestActions request={{ allowedActions } as RequestDetail} renderers={renderers} />);
    return screen.queryAllByRole("button").map(button => button.textContent);
}

// What the server lists for the owner of a request in each state (README 5.2). The server's order is not the page's order.
it.each([
    ["Open", ["cancel", "edit"], ["Edit request", "Cancel request"]],
    ["Assigned, before the window ends", ["cancel", "cancel_assignment", "confirm_collected"], ["Confirm collected", "Cancel assignment", "Cancel request"]],
    ["Assigned, after the window ends", ["report_missed", "confirm_collected"], ["Confirm collected", "Report missed pickup"]],
    ["Collected", [], []],
    ["Delivered", [], []],
    ["Cancelled", [], []],
    ["Expired", [], []],
    ["Missed", [], []],
] as const)("puts the main task first and the cancel buttons last for a request that is %s", (_state, allowed, expected) => {
    expect(shown([...allowed])).toEqual(expected);
});

it("never puts a cancel button first when a main task is shown", () => {
    const buttons = shown(["cancel", "cancel_assignment", "confirm_collected", "report_missed", "edit"]);
    expect(buttons).toEqual(["Confirm collected", "Edit request", "Report missed pickup", "Cancel assignment", "Cancel request"]);
});

it("shows only the actions the server lists", () => {
    expect(shown(["cancel"])).toEqual(["Cancel request"]);
});

it("stacks the buttons at full width on a phone and puts them side by side from 640 px", () => {
    render(<RequestActions request={{ allowedActions: ["cancel"] } as RequestDetail} renderers={renderers} />);
    expect(screen.getByRole("region", { name: "Request actions" })).toHaveClass(
        "flex-col", "sm:flex-row", "[&>button]:w-full", "sm:[&>button]:w-auto");
});

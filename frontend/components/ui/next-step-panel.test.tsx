import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { RequestStatus } from "@/lib/types";
import { NextStepPanel } from "./next-step-panel";

afterEach(cleanup);

function panel(status: RequestStatus, quiet = false) {
    return <NextStepPanel title="2 × Computers/Laptops" status={status} viewer="resident" quiet={quiet}
        actions={<button type="button">Do it</button>} />;
}
const announcement = () => screen.getByRole("status");
// The wrapper the fade class goes on, and the sentence it sits on
const badgeWrapper = (name: string) => screen.getByText(name, { selector: "span" }).parentElement!;
const sentence = (text: string) => screen.getByText(text);

it("announces nothing and animates nothing on the first load", () => {
    render(panel("Open"));
    expect(announcement()).toBeEmptyDOMElement();
    expect(badgeWrapper("Open")).not.toHaveClass("fade-in");
    expect(sentence("Waiting for a volunteer.")).not.toHaveClass("fade-in");
});

it("announces a change of status once and fades the badge and the sentence in again", () => {
    const { rerender } = render(panel("Open"));
    const oldBadge = badgeWrapper("Open");
    const oldSentence = sentence("Waiting for a volunteer.");
    rerender(panel("Assigned"));
    expect(announcement()).toHaveTextContent("Status updated: Assigned.");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(badgeWrapper("Assigned")).toHaveClass("fade-in");
    expect(badgeWrapper("Assigned")).not.toBe(oldBadge);
    expect(sentence("A volunteer will collect your items in the selected window.")).toHaveClass("fade-in");
    expect(sentence("A volunteer will collect your items in the selected window.")).not.toBe(oldSentence);
});

it("does nothing when a refresh brings the same status", () => {
    const { rerender } = render(panel("Open"));
    const oldBadge = badgeWrapper("Open");
    const oldSentence = sentence("Waiting for a volunteer.");
    rerender(panel("Open"));
    expect(announcement()).toBeEmptyDOMElement();
    expect(badgeWrapper("Open")).toBe(oldBadge);
    expect(sentence("Waiting for a volunteer.")).toBe(oldSentence);
    expect(oldBadge).not.toHaveClass("fade-in");
});

it("stays quiet when the person's own action caused the change", () => {
    const { rerender } = render(panel("Assigned"));
    const oldBadge = badgeWrapper("Assigned");
    rerender(panel("Collected", true));
    expect(announcement()).toBeEmptyDOMElement();
    expect(badgeWrapper("Collected")).not.toHaveClass("fade-in");
    expect(badgeWrapper("Collected")).toBe(oldBadge);
});

it("announces the next change that comes by itself after a quiet one", () => {
    const { rerender } = render(panel("Open"));
    rerender(panel("Assigned", true));
    rerender(panel("Collected"));
    expect(announcement()).toHaveTextContent("Status updated: Collected.");
});

it("does not move focus when the status changes", () => {
    const { rerender } = render(panel("Open"));
    const button = screen.getByRole("button", { name: "Do it" });
    button.focus();
    rerender(panel("Assigned"));
    expect(button).toHaveFocus();
});

it("keeps the announcement out of sight, in a polite status region", () => {
    render(panel("Open"));
    expect(announcement()).toHaveClass("sr-only");
});

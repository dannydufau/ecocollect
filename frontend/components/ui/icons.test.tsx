import { afterEach, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import * as icons from "./icons";

afterEach(cleanup);

it.each(Object.entries(icons))("%s is hidden from screen readers and takes a className", (_, Icon) => {
    const { container } = render(<Icon className="size-8 text-accent" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
    expect(svg).toHaveAttribute("stroke", "currentColor");
    expect(svg).toHaveClass("size-8", "text-accent");
});

it("has the 24 icons", () => {
    expect(Object.keys(icons)).toHaveLength(24);
});

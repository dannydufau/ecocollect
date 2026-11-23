import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Button, CameraIcon, EmptyState, Field, FieldError, FilterTabs, RequestPhoto, WindowList } from "./index";

afterEach(() => {
    cleanup();
});

describe("form components", () => {
    it("disables a busy button and shows its busy label", () => {
        render(<Button busy busyLabel="Saving...">Save</Button>);
        const button = screen.getByRole("button", { name: "Saving..." });
        expect(button).toBeDisabled();
    });

    it("draws the danger-outline button as a red outline with red text, not a fill", () => {
        render(<Button variant="danger-outline">Cancel request</Button>);
        const button = screen.getByRole("button", { name: "Cancel request" });
        expect(button).toHaveClass("border-danger", "text-danger");
        expect(button).not.toHaveClass("bg-danger");
    });

    it("links a field error with aria-describedby and sets aria-invalid", () => {
        render(<Field label="Name" error="Enter a name">{(control) => <input {...control} />}</Field>);
        const input = screen.getByLabelText("Name");
        expect(input).toHaveAttribute("aria-invalid", "true");
        expect(input).toHaveAccessibleDescription("Enter a name");
    });

    it("shows an invalid field's message with an icon, announced, and fading in", () => {
        render(<Field label="Name" error="Enter a name">{(control) => <input {...control} />}</Field>);
        const message = screen.getByRole("alert");
        expect(message).toHaveTextContent("Enter a name");
        expect(message.querySelector("svg[aria-hidden=true]")).not.toBeNull();
        expect(message).toHaveClass("fade-in", "text-danger");
        expect(screen.getByLabelText("Name")).toHaveAttribute("aria-describedby", message.id);
    });

    it("FieldError passes an id and tabIndex on, so a form can focus it", () => {
        render(<FieldError id="e1" tabIndex={-1} className="mt-1">Pick one</FieldError>);
        expect(screen.getByRole("alert")).toHaveAttribute("id", "e1");
        expect(screen.getByRole("alert")).toHaveAttribute("tabindex", "-1");
        expect(screen.getByRole("alert")).toHaveClass("mt-1");
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

    it("starts again with a refetch when the photo url changes", () => {
        const refetch = vi.fn();
        const { rerender } = render(<RequestPhoto src="/a.jpg" alt="Old laptop" refetch={refetch} />);
        fireEvent.error(screen.getByRole("img", { name: "Old laptop" }));
        rerender(<RequestPhoto src="/b.jpg" alt="Old laptop" refetch={refetch} />);
        fireEvent.error(screen.getByRole("img", { name: "Old laptop" }));
        expect(refetch).toHaveBeenCalledTimes(2);
        expect(screen.getByRole("img", { name: "Old laptop" })).toBeInTheDocument();
    });

    it("styles the label, hint and error and keeps them linked", () => {
        render(<Field label="Name" hint="Your full name" error="Enter a name">{(control) => <input {...control} />}</Field>);
        expect(screen.getByText("Name")).toHaveClass("text-sm", "font-semibold");
        expect(screen.getByText("Your full name")).toHaveClass("text-small", "text-text-muted");
        expect(screen.getByText("Enter a name")).toHaveClass("text-small", "font-semibold", "text-danger");
        expect(screen.getByLabelText("Name")).toHaveAccessibleDescription("Your full name Enter a name");
    });

    it("announces a field error", () => {
        render(<Field label="Name" error="Enter a name">{(control) => <input {...control} />}</Field>);
        expect(screen.getByRole("alert")).toHaveTextContent("Enter a name");
    });

    it("has no dark mode rule in globals.css", () => {
        const css = readFileSync("app/globals.css", "utf8");
        expect(css).not.toContain("prefers-color-scheme");
    });

    it("cuts all motion for people who ask for less, and never animates layout", () => {
        const css = readFileSync("app/globals.css", "utf8");
        const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/)![0];
        expect(reduced).toContain("animation-duration: 0.01ms !important");
        expect(reduced).toContain("animation-iteration-count: 1 !important");
        expect(reduced).toContain("transition-duration: 0.01ms !important");
        expect(css.match(/!important/g)).toHaveLength(3);
        expect(css).toContain("--ease-standard: cubic-bezier(0.2, 0, 0, 1)");
        expect(css).toContain("@starting-style");
        const transitions = css.match(/transition(-property)?:[^;]*;/g)!.join(" ");
        expect(transitions).not.toMatch(/\b(all|height|width|margin)\b/);
    });

    it("gives buttons a soft transition and a small press only with motion allowed", () => {
        render(<Button>Press</Button>);
        expect(screen.getByRole("button", { name: "Press" })).toHaveClass("soft-transition", "motion-safe:not-disabled:active:scale-[0.985]");
    });

    it("keeps the h2 and h3 defaults in the base layer so size classes still win", () => {
        const css = readFileSync("app/globals.css", "utf8");
        const base = css.match(/@layer base \{[\s\S]*?\n\}/)![0];
        expect(base).toMatch(/h2 \{/);
        expect(base).toMatch(/h3 \{/);
    });
});

it("EmptyState is a dashed card with just a title and children", () => {
    const { container } = render(<EmptyState title="Nothing here"><button>Show all</button></EmptyState>);
    expect(container.firstChild).toHaveClass("border-dashed", "rounded-2xl");
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show all" })).toBeInTheDocument();
    expect(container.querySelector("[aria-hidden=true]")).toBeNull();
});

it("EmptyState fills its dashed box with the inset surface", () => {
    const { container } = render(<EmptyState title="Nothing" />);
    expect(container.firstElementChild).toHaveClass("bg-surface", "border-dashed", "rounded-2xl");
    expect(container.firstElementChild!.className).not.toMatch(/bg-surface\/\d/);
});

it("EmptyState shows a hidden icon and an action", () => {
    const { container } = render(<EmptyState title="Nothing" icon={<CameraIcon />} action={<a href="/stats">See stats</a>}>Some text</EmptyState>);
    expect(container.querySelector("[aria-hidden=true] svg")).not.toBeNull();
    // The icon is drawn at 24px and in the muted text colour, whatever size it was given
    expect(container.querySelector("[aria-hidden=true]")).toHaveClass("text-text-muted", "[&>svg]:size-6");
    expect(screen.getByText("Some text")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See stats" })).toHaveAttribute("href", "/stats");
});

it("WindowList shows a hidden icon and the exact text on each row", () => {
    render(<WindowList windows={[{ date: "2026-11-20", startHour: 11 }, { date: "2026-11-21", startHour: 14 }]} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows.map(row => row.textContent)).toEqual(["Fri, Nov 20, 11:00 to 12:00", "Sat, Nov 21, 14:00 to 15:00"]);
    for (const row of rows) expect(row.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("list")).not.toHaveClass("list-disc");
});

it("RequestPhoto keeps a fixed box, and the failure box has the same shape, an icon and the text", () => {
    const refetch = vi.fn();
    const { container } = render(<RequestPhoto src="/a.jpg" alt="Old laptop" refetch={refetch} />);
    const image = screen.getByRole("img", { name: "Old laptop" });
    expect(image).toHaveClass("aspect-[4/3]", "object-contain", "bg-surface", "rounded-xl", "border");
    fireEvent.error(image);
    expect(refetch).toHaveBeenCalledOnce();
    fireEvent.error(screen.getByRole("img", { name: "Old laptop" }));
    expect(container.firstChild).toHaveClass("aspect-[4/3]");
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("The photo is not available right now.")).toBeInTheDocument();
});

it("a filter chip scales down while pressed, but not under reduced motion", () => {
    render(<FilterTabs label="Status" options={["Open", "Assigned"]} value="Open" onChange={vi.fn()} />);
    for (const name of ["Open", "Assigned"]) expect(screen.getByRole("button", { name })).toHaveClass("motion-safe:active:scale-[0.985]", "motion-safe:active:duration-(--duration-press)");
});

describe("FilterTabs fade", () => {
    function sized(scrollWidth: number, clientWidth: number) {
        vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(scrollWidth);
        vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(clientWidth);
        // jsdom does not clamp scrollLeft like a browser, so the centring must land on 0
        vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(clientWidth);
    }
    const options = ["All", "Open", "Assigned"] as const;
    const fades = (side: string) => document.querySelector(`[data-fade=${side}]`);
    afterEach(() => vi.restoreAllMocks());

    it("shows no fade when nothing overflows", () => {
        sized(300, 300);
        render(<FilterTabs label="Status" options={options} value="All" onChange={vi.fn()} />);
        expect(fades("left")).toBeNull();
        expect(fades("right")).toBeNull();
    });

    it("fades only the side with more to scroll, and buttons still select", () => {
        sized(600, 300);
        const onChange = vi.fn();
        render(<FilterTabs label="Status" options={options} value="All" onChange={onChange} />);
        const row = screen.getByRole("group", { name: "Status" });
        row.scrollLeft = 0;
        fireEvent.scroll(row);
        expect(fades("left")).toBeNull();
        expect(fades("right")).toHaveAttribute("aria-hidden", "true");
        row.scrollLeft = 300;
        fireEvent.scroll(row);
        expect(fades("left")).not.toBeNull();
        expect(fades("right")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Open" }));
        expect(onChange).toHaveBeenCalledWith("Open");
    });

    it("keeps the chosen and focused chips above the fade", () => {
        sized(600, 300);
        render(<FilterTabs label="Status" options={options} value="Open" onChange={vi.fn()} />);
        expect(screen.getByRole("button", { name: "Open" })).toHaveClass("relative", "z-10");
        expect(screen.getByRole("button", { name: "All" })).toHaveClass("focus-visible:z-10");
    });
});

it("EmptyState can drop its box when it sits inside a card", () => {
    const { container } = render(<EmptyState bare title="Nothing" />);
    expect(container.firstChild).not.toHaveClass("border-dashed");
});

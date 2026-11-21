import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// isDemo is read when lib/demo loads, so each test loads the banner again
async function banner(flag?: string) {
    if (flag) vi.stubEnv("NEXT_PUBLIC_DEMO", flag);
    vi.resetModules();
    const { default: DemoBanner } = await import("./demo-banner");
    return render(<DemoBanner />);
}

afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
});

it("renders nothing without the demo flag", async () => {
    const { container } = await banner();
    expect(container).toBeEmptyDOMElement();
});

it("shows the demo banner in a demo build", async () => {
    await banner("true");
    expect(screen.getByText(/Everyone shares this demo data. It resets every night./)).toBeInTheDocument();
    expect(screen.getByRole("note")).toBeInTheDocument();
});

it("has a hidden info icon inside the header width", async () => {
    await banner("true");
    const note = screen.getByRole("note");
    expect(note.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(note.querySelector("p")).toHaveClass("max-w-5xl");
});

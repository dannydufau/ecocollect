import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import ErrorPage from "./error";
import GlobalError from "./global-error";
import Loading from "./loading";
import NotFound from "./not-found";

vi.mock("./fonts", () => ({ body: { variable: "body-font" } }));

afterEach(cleanup);

it("focuses the not-found content and links back to EcoCollect", () => {
    render(<NotFound />);
    expect(screen.getByRole("main", { name: "We could not find that page." })).toHaveFocus();
    expect(screen.getByRole("link", { name: "Go to EcoCollect" })).toHaveAttribute("href", "/");
});

it("focuses the error content and resets the route when requested", async () => {
    const reset = vi.fn();
    render(<ErrorPage reset={reset} />);
    expect(screen.getByRole("main", { name: "Something went wrong." })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
});

it("uses Next's retry when it can refetch the segment", async () => {
    const reset = vi.fn();
    const retry = vi.fn();
    render(<ErrorPage reset={reset} retry={retry} />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(reset).not.toHaveBeenCalled();
});

it("renders a standalone global error document with the app body font", () => {
    const markup = renderToStaticMarkup(<GlobalError />);
    expect(markup).toContain('<html lang="en" class="body-font');
    expect(markup).toContain("<body");
    expect(markup).toContain('aria-label="Something went wrong."');
    expect(markup).toContain("Try again");
});

it("exposes the shared loading status to assistive technology", () => {
    render(<Loading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading...");
});

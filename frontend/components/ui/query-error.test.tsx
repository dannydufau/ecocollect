import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryError } from "./query-error";

afterEach(cleanup);

it("shows the message and retries", () => {
    const onRetry = vi.fn();
    render(<QueryError message="We could not load this." onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("We could not load this.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
});

it("is busy while retrying", () => {
    render(<QueryError message="Nope." onRetry={vi.fn()} busy />);
    expect(screen.getByRole("button", { name: "Trying..." })).toBeDisabled();
});

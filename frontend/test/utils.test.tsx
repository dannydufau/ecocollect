import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { formatHour } from "@/lib/time";
import { renderWithClient } from "./utils";

it("renders inside a QueryClientProvider", () => {
  renderWithClient(<p>hi</p>);
  expect(screen.getByText("hi")).toBeInTheDocument();
});

it("resolves the @/ alias", () => {
  expect(formatHour(7)).toBe("07:00");
});

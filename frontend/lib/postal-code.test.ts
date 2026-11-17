import { expect, it } from "vitest";
import { formatPostalCode } from "./postal-code";

it("adds the space in the middle of a postal code", () => {
    expect(formatPostalCode("T2P1J9")).toBe("T2P 1J9");
});

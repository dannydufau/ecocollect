import { expect, it } from "vitest";
import { readableFieldError } from "./field-messages";

it("turns a Request Service fragment into a sentence", () => {
    expect(readableFieldError("evidencePhoto.fileId", "photo check failed")).toBe("We couldn't use this photo. Please remove it and add it again.");
    expect(readableFieldError("reason", "must be at most 500 characters")).toBe("Please use 500 characters or fewer.");
});

it("keeps a message that is already a sentence", () => {
    expect(readableFieldError("address.street", "Enter a street.")).toBe("Enter a street.");
});

it("falls back to a general sentence for a fragment it does not know", () => {
    expect(readableFieldError("items[0].colour", "unknown field")).toBe("This wasn't accepted. Please check it and try again.");
    expect(readableFieldError("x", "toString")).toBe("This wasn't accepted. Please check it and try again.");
});

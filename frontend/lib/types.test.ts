import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("generated types include every allowed action", () => {
    const generated = readFileSync("lib/api-types.ts", "utf8");
    const actions = ["edit", "cancel", "cancel_assignment", "confirm_collected", "report_missed", "accept", "record_delivery"];
    for (const action of actions) {
        expect(generated).toContain(`"${action}"`);
    }
});

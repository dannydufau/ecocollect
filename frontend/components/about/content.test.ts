import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { acceptedCategories, journeySteps, trustPrinciples, workedExample } from "./content";

// Parse INSERT INTO requests.item_category tuples from db/init/011_request_seed.sql
function seededCategories() {
    const sqlPath = resolve(__dirname, "../../../db/init/011_request_seed.sql");
    const sql = readFileSync(sqlPath, "utf8");
    const block = sql.match(/INSERT INTO requests\.item_category[\s\S]*?ON CONFLICT/i)?.[0] ?? "";
    return [...block.matchAll(/\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*([\d.]+)\)/g)].map((m) => ({
        id: m[1],
        name: m[2],
        wasteType: m[3],
        standardWeightKg: Number(m[4]),
    }));
}

it("matches every category and standard weight in db/init/011_request_seed.sql", () => {
    const seeded = seededCategories();
    expect(seeded.length).toBeGreaterThan(0);
    expect(acceptedCategories).toEqual(seeded);
});

it("computes the worked Monitor EcoPoints example accurately per FR18", () => {
    const monitor = acceptedCategories.find((c) => c.id === "monitors");
    expect(monitor).toBeDefined();
    expect(workedExample.standardWeightKg).toBe(monitor!.standardWeightKg);
    expect(workedExample.estimatedWeightKg).toBe(workedExample.quantity * monitor!.standardWeightKg);
    expect(workedExample.volunteerPoints).toBe(23);
    expect(workedExample.residentPoints).toBe(11.5);
});

it("covers all four pickup lifecycle steps in order and four trust principles", () => {
    expect(journeySteps.map((s) => s.status)).toEqual(["Open", "Assigned", "Collected", "Delivered"]);
    expect(trustPrinciples).toHaveLength(4);
});

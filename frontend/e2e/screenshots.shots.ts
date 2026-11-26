import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "@playwright/test";
import { fontsLoaded, prepareSession } from "./session";
import { shotTargets } from "./shot-targets";

// `npm run e2e:shots -- --only request` sets this to take a subset
const only = process.env.SHOTS_ONLY?.toLowerCase();

for (const target of shotTargets.filter(({ name }) => !only || name.toLowerCase().includes(only))) {
    test(target.name, async ({ page }) => {
        await prepareSession(page, target.account);
        await page.goto(target.path);
        // A page has a title, and a 404 or an error screen has a labelled main area
        await page.locator("h1, main[aria-label]").first().waitFor();
        await page.getByRole("status").filter({ hasText: /Loading/i }).waitFor({ state: "detached" });
        await fontsLoaded(page);

        const width = page.viewportSize()!.width;
        const folder = join(__dirname, "shots", target.name);
        mkdirSync(folder, { recursive: true });
        await page.screenshot({ path: join(folder, `${width}.png`), fullPage: true });
    });
}

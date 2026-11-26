import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openRoute } from "./helpers";
import { fontsLoaded, width } from "./session";
import { routes } from "./routes";

for (const route of routes) {
    test(`${route.name} loads with the expected title, headings and layout`, async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("console", message => {
            if (message.type() === "error") errors.push(message.text());
        });
        await openRoute(page, route);
        await expect(page).toHaveTitle(route.title);
        await fontsLoaded(page);
        if ([375, 1280].includes(width(page))) {
            const levels = await page.evaluate(() => [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")]
                .filter(heading => heading.checkVisibility()).map(heading => Number(heading.tagName[1])));
            expect(levels[0], `heading levels: ${levels.join(" ")}`).toBe(1);
            levels.slice(1).forEach((level, index) => expect(level - levels[index], `heading levels: ${levels.join(" ")}`).toBeLessThanOrEqual(1));
        }
        if ([320, 375, 768].includes(width(page))) {
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            expect(overflow, "pixels past the right edge").toBeLessThanOrEqual(0);
        }
        expect(errors).toEqual([]);
    });

    test(`${route.name} has no serious or critical accessibility violations`, async ({ page, viewport }) => {
        test.skip(viewport?.width !== 375 && viewport?.width !== 1280, "Accessibility scans run at 375 and 1280 px.");
        await openRoute(page, route);
        const { violations } = await new AxeBuilder({ page }).analyze();
        const failures = violations.filter(({ impact }) => impact === "serious" || impact === "critical");
        expect(failures.map(({ id, impact, nodes }) => ({
            id, impact, targets: nodes.map(({ target }) => target),
        }))).toEqual([]);
    });
}

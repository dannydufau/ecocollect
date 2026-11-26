import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openRoute } from "./helpers";
import { routes } from "./routes";

for (const route of routes) {
    test(`${route.name} loads without browser errors`, async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("console", message => {
            if (message.type() === "error") errors.push(message.text());
        });
        await openRoute(page, route);
        await expect(page).toHaveTitle(route.title);
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

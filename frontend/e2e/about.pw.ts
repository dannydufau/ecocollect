import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openPage, width } from "./session";

test("about passes Axe accessibility scan and fits the signed-out header at 320 px", async ({ page }) => {
    test.skip(width(page) !== 320, "Dedicated 320 px narrow-screen check.");
    await openPage(page, "/about", null);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("link", { name: "About" })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("link", { name: "Community stats" })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "pixels past the right edge at 320 px").toBeLessThanOrEqual(0);

    const { violations } = await new AxeBuilder({ page }).analyze();
    const failures = violations.filter(({ impact }) => impact === "serious" || impact === "critical");
    expect(failures.map(({ id, impact, nodes }) => ({
        id, impact, targets: nodes.map(({ target }) => target),
    }))).toEqual([]);
});

test.describe("about hero animation with normal motion", () => {
    test.use({ reducedMotion: "no-preference" });

    test("runs the hero route-draw animation without console errors", async ({ page }) => {
        test.skip(width(page) !== 1280, "Motion check runs once on desktop.");
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
            if (message.type() === "error") errors.push(message.text());
        });

        await openPage(page, "/about", null);
        const path = page.locator(".about-route-path");
        await expect(path).toBeVisible();

        const animationName = await path.evaluate((el) => getComputedStyle(el).animationName);
        expect(animationName).toContain("route-draw");
        expect(errors).toEqual([]);
    });
});

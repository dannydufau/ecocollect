import { expect, test, type Page } from "@playwright/test";
import { fixtureAccounts, fixtureRequests } from "../mock/fixtures.mjs";
import { openPage, width } from "./session";

// The look of the design system, read from the page as the browser draws it. Each value is the one the design asks for.
const resident = fixtureAccounts.resident;
const style = (page: Page, selector: string, property: string) =>
    page.locator(selector).first().evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);

test.describe("colours", () => {
    test("the page, a card, an inset well, the primary button and the body text use the design's colours", async ({ page }) => {
        await openPage(page, "/resident", fixtureAccounts.empty);
        expect(await style(page, "body", "background-color"), "page background").toBe("rgb(245, 234, 216)");
        expect(await style(page, "body", "color"), "body text").toBe("rgb(32, 30, 29)");
        expect(await style(page, "div.border-dashed", "background-color"), "an inset well (the empty state)").toBe("rgb(235, 221, 197)");
        expect(await style(page, "main a.bg-accent, main button.bg-accent", "background-color"), "the primary button").toBe("rgb(158, 82, 32)");
    });

    test("a card is the raised colour", async ({ page }) => {
        await openPage(page, `/resident/requests/${fixtureRequests.Open}`, resident);
        expect(await style(page, 'section[aria-label="Request status"]', "background-color")).toBe("rgb(252, 249, 242)");
    });
});

test.describe("type", () => {
    test("the title and the brand are Caprasimo, everything else is Figtree, and nothing is monospace", async ({ page }) => {
        await openPage(page, `/resident/requests/${fixtureRequests.Open}`, resident);
        const family = (selector: string) => style(page, selector, "font-family").then(value => value.split(",")[0].replaceAll('"', ""));
        expect(await family("h1"), "h1").toBe("Caprasimo");
        expect(await family("header a:first-child"), "the header brand").toBe("Caprasimo");
        for (const [name, selector] of [["h2", "h2"], ["body text", "p"], ["a button", "main button, main a.bg-accent, main a[class*='border']"], ["a badge", 'section[aria-label="Request status"] span.rounded-full'], ["a label", "nav a"]] as const) {
            expect(await family(selector), name).toBe("Figtree");
        }
        const mono = await page.evaluate(() => [...document.querySelectorAll("*")].filter(element => /mono|courier/i.test(getComputedStyle(element).fontFamily)).length);
        expect(mono, "elements with a monospace font").toBe(0);
    });

    test("body text is at least 17 px, and hints and error messages at least 14 px", async ({ page }) => {
        await openPage(page, "/register", null);
        expect(parseFloat(await style(page, "body", "font-size")), "body text").toBeGreaterThanOrEqual(17);
        expect(parseFloat(await style(page, "main p", "font-size")), "a paragraph").toBeGreaterThanOrEqual(17);
        const hint = page.getByText("You must be 18 or older.");
        expect(parseFloat(await hint.evaluate(element => getComputedStyle(element).fontSize)), "a hint").toBeGreaterThanOrEqual(14);
        await page.getByRole("checkbox", { name: /accept the terms/i }).check();
        await page.getByRole("button", { name: "Create account" }).click();
        const error = page.getByRole("alert").first();
        await expect(error).toBeVisible();
        expect(parseFloat(await error.evaluate(element => getComputedStyle(element).fontSize)), "an error message").toBeGreaterThanOrEqual(14);
    });
});

test.describe("motion", () => {
    test.use({ reducedMotion: "no-preference" });

    test("a button's hover transition is 150 ms and its pressed transition is 100 ms", async ({ page }) => {
        test.skip(width(page) !== 1280, "Needs a mouse.");
        await openPage(page, "/resident", fixtureAccounts.empty);
        const button = page.getByRole("link", { name: "Create your first request" });
        expect(await button.evaluate(element => getComputedStyle(element).transitionDuration.split(", ")[0]), "hover").toBe("0.15s");
        await button.hover();
        await page.mouse.down();
        expect(await button.evaluate(element => getComputedStyle(element).transitionDuration.split(", ")[0]), "pressed").toBe("0.1s");
        await page.mouse.up();
    });

    test("primary buttons, link buttons and chips scale down while pressed", async ({ page }) => {
        test.skip(width(page) !== 1280, "Needs a mouse.");
        await openPage(page, "/resident", resident);
        const pressed = async (selector: string) => {
            const target = page.locator(selector).first();
            await target.hover();
            await page.mouse.down();
            await page.waitForTimeout(250);
            const scale = await target.evaluate(element => getComputedStyle(element).scale);
            // Let go away from the control, so a link does not open and a chip does not change
            await page.mouse.move(0, 0);
            await page.mouse.up();
            return scale;
        };
        expect(Number(await pressed("main a.bg-accent")), "a link button").toBeLessThan(1);
        expect(Number(await pressed('main [role="group"] button')), "a chip").toBeLessThan(1);
    });

    test("a dialog opens in 200 ms and closes in 150 ms", async ({ page, browserName }) => {
        test.skip(browserName !== "chromium", "Exit transition timing uses allow-discrete, which WebKit/Firefox skip by design.");
        await openPage(page, `/volunteer/requests/${fixtureRequests.Open}`, fixtureAccounts.volunteer);
        await page.getByRole("button", { name: "Accept request" }).click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        const duration = () => dialog.evaluate(element => getComputedStyle(element).transitionDuration.split(", ")[0]);
        expect(await duration(), "opening").toBe("0.2s");
        await dialog.getByRole("button", { name: "Cancel" }).click();
        expect(await duration(), "closing").toBe("0.15s");
    });

    test("the More sheet opens and closes in 240 ms", async ({ page, browserName }) => {
        test.skip(width(page) !== 375 || browserName !== "chromium", "The More sheet is the phone menu; allow-discrete timing is Chromium-only.");
        await openPage(page, "/resident", resident);
        await page.getByRole("navigation", { name: "Mobile" }).getByRole("button", { name: "More" }).click();
        const sheet = page.getByRole("dialog", { name: "More" });
        await expect(sheet).toBeVisible();
        const durations = () => sheet.evaluate(element => [getComputedStyle(element).transitionDuration, getComputedStyle(element, "::backdrop").transitionDuration]);
        expect(await durations(), "opening").toEqual(["0.24s, 0.24s, 0.24s", "0.24s, 0.24s, 0.24s"]);
        await sheet.getByRole("button", { name: "Close" }).click();
        expect(await durations(), "closing").toEqual(["0.24s, 0.24s, 0.24s", "0.24s, 0.24s, 0.24s"]);
    });
});

test.describe("reduced motion", () => {
    test.use({ reducedMotion: "reduce" });

    test("nothing slides or fades in more than a blink: the sheet, the dialogs and the buttons", async ({ page }) => {
        test.skip(width(page) !== 375, "Checked on the phone, where the sheet is.");
        await openPage(page, `/volunteer/requests/${fixtureRequests.Open}`, fixtureAccounts.volunteer);
        const slow = (element: Element) => getComputedStyle(element).transitionDuration.split(", ").some(value => parseFloat(value) > 0.001);
        expect(await page.getByRole("button", { name: "Accept request" }).evaluate(slow), "a button").toBe(false);
        await page.getByRole("button", { name: "Accept request" }).click();
        expect(await page.getByRole("dialog").evaluate(slow), "a dialog").toBe(false);
        await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
        await page.getByRole("navigation", { name: "Mobile" }).getByRole("button", { name: "More" }).click();
        const sheet = page.getByRole("dialog", { name: "More" });
        expect(await sheet.evaluate(slow), "the More sheet").toBe(false);
        expect(await sheet.evaluate(element => getComputedStyle(element, "::backdrop").transitionDuration.split(", ").some(value => parseFloat(value) > 0.001)), "its backdrop").toBe(false);
    });
});

test.describe("badges, fields and sizes", () => {
    for (const status of ["Open", "Assigned", "Collected", "Delivered", "Missed", "Cancelled", "Expired"] as const) {
        test(`the ${status} badge shows an icon`, async ({ page }) => {
            test.skip(width(page) !== 375, "The same at every width.");
            await openPage(page, `/resident/requests/${fixtureRequests[status]}`, resident);
            const badge = page.locator('section[aria-label="Request status"] span.rounded-full').filter({ hasText: status }).first();
            await expect(badge).toBeVisible();
            await expect(badge.locator("svg[aria-hidden=true]")).toHaveCount(1);
        });
    }

    test("an invalid field on the register page has the danger border and a message with an icon", async ({ page }) => {
        test.skip(width(page) !== 375, "The same at every width.");
        await openPage(page, "/register", null);
        await page.getByRole("checkbox", { name: /accept the terms/i }).check();
        await page.getByRole("button", { name: "Create account" }).click();
        const field = page.getByLabel("First name");
        await expect(field).toHaveAttribute("aria-invalid", "true");
        // The border changes colour with a short transition, so wait until it has settled
        await expect.poll(() => page.evaluate(() => {
            const probe = document.createElement("span");
            probe.style.color = "var(--color-danger)";
            document.body.append(probe);
            const danger = getComputedStyle(probe).color;
            probe.remove();
            return getComputedStyle(document.querySelector("input[aria-invalid=true]")!).borderColor === danger;
        }), { message: "the border of the invalid field is the danger colour" }).toBe(true);
        const message = page.getByRole("alert").filter({ hasText: "Enter your first name" });
        await expect(message.locator("svg[aria-hidden=true]")).toHaveCount(1);
    });

    test("buttons and links on a phone are at least 24 px, and primary buttons at least 44 px", async ({ page }) => {
        test.skip(width(page) !== 375, "Checked on the phone.");
        for (const path of ["/resident", `/resident/requests/${fixtureRequests.Assigned}`, "/volunteer", "/resident/requests/new"]) {
            await openPage(page, path, resident);
        }
        const small = await page.evaluate(() => {
            const found: string[] = [];
            for (const element of document.querySelectorAll("button, a[href]")) {
                if (!(element as HTMLElement).checkVisibility() || element.closest("[class*='sr-only']") || element.matches("[class*='sr-only']")) continue;
                if (element.closest("p, li") && element.matches("a:not([class*='button'])") && element.closest("p")) continue;   // a link inside a sentence is exempt (WCAG 2.5.8)
                const box = element.getBoundingClientRect();
                const primary = getComputedStyle(element).backgroundColor === "rgb(158, 82, 32)";
                if (box.height < (primary ? 44 : 24) || box.width < 24) found.push(`${element.textContent?.trim().slice(0, 24) || element.getAttribute("aria-label")} ${Math.round(box.width)}x${Math.round(box.height)}${primary ? " (primary)" : ""}`);
            }
            return found;
        });
        expect(small, "controls that are too small").toEqual([]);
    });
});

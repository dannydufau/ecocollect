import { expect, test, type Page } from "@playwright/test";
import { fixtureAccounts, fixtureRequests } from "../mock/fixtures.mjs";
import { openPage, width } from "./session";
import { routes } from "./routes";

const statuses = ["Open", "Assigned", "Collected", "Delivered", "Missed", "Cancelled", "Expired"] as const;
const views = [
    { role: "resident", account: fixtureAccounts.resident, path: "/resident/requests/" },
    { role: "volunteer", account: fixtureAccounts.volunteer, path: "/volunteer/requests/" },
] as const;

// The page's own buttons. A dialog sits in the same group, so its buttons are left out.
const actionButtons = (page: Page) => page.getByRole("region", { name: "Request actions" }).locator(":scope > button, :scope > a");
const panel = (page: Page) => page.getByRole("region", { name: "Request status" });

// ---------------------------------------------------------------- the request pages
for (const { role, account, path } of views) {
    for (const status of statuses) {
        test.describe(`${role} view of a ${status} request`, () => {
            test.beforeEach(async ({ page }) => openPage(page, path + fixtureRequests[status], account));

            test("the main action is fully visible at 375 x 667 without scrolling", async ({ page }) => {
                test.skip(width(page) !== 375, "Checked at 375 x 667.");
                const first = actionButtons(page).first();
                if (await first.count() === 0) return;                     // a status with no action has nothing to see
                const box = (await first.boundingBox())!;
                const bar = (await page.getByRole("navigation", { name: "Mobile" }).boundingBox())!;
                expect(box.y, "top of the first action").toBeGreaterThanOrEqual(0);
                expect(box.y + box.height, "bottom of the first action, above the bottom bar").toBeLessThanOrEqual(bar.y);
            });

            test("a cancel button is never first when a main action exists", async ({ page }) => {
                const labels = (await actionButtons(page).allTextContents()).map(text => text.trim());
                if (labels.length > 1) expect(labels[0], labels.join(" > ")).not.toMatch(/^Cancel/);
            });

            test("the stepper shows for Open, Assigned, Collected and Delivered only", async ({ page }) => {
                const stepper = page.getByRole("list", { name: "Request progress" });
                if (await panel(page).count() === 0) return;                // the unavailable page has no panel
                await expect(stepper).toHaveCount(["Open", "Assigned", "Collected", "Delivered"].includes(status) ? 1 : 0);
            });
        });
    }
}

for (const { role, account, path } of views) {
    for (const status of ["Assigned", "Collected"] as const) {
        test(`${role} view of a ${status} request: the other person's name and the time come before the first action`, async ({ page }) => {
            await openPage(page, path + fixtureRequests[status], account);
            const top = panel(page);
            const person = top.getByRole("link").filter({ hasNotText: /^$/ }).first();
            const when = top.getByText(status === "Assigned" ? "Selected window" : "Collected", { exact: false }).first();
            await expect(person, "the other person's name").toBeVisible();
            await expect(when, "the window or the collection time").toBeVisible();
            const action = actionButtons(page).first();
            if (await action.count() === 0) return;                        // nothing to come before
            const [personBox, whenBox, actionBox] = await Promise.all([person.boundingBox(), when.boundingBox(), action.boundingBox()]);
            expect(personBox!.y, "the person's name").toBeLessThan(actionBox!.y);
            expect(whenBox!.y, "the window or the collection time").toBeLessThan(actionBox!.y);
        });
    }
}

// ---------------------------------------------------------------- the header
const headerWidths = [960, 1024, 1280, 1440];
const headerAccounts = [
    { name: "a two-role account", account: fixtureAccounts.both, path: "/resident" },
    { name: "a one-role account", account: fixtureAccounts.resident, path: "/resident" },
];

test("the header is one row, and as tall for a two-role as for a one-role account, from 960 to 1440 px", async ({ page, browser }) => {
    test.skip(width(page) !== 1280, "It sets its own widths.");
    for (const viewportWidth of headerWidths) {
        const heights: number[] = [];
        for (const { name, account, path } of headerAccounts) {
            const context = await browser.newContext({ viewport: { width: viewportWidth, height: 800 }, reducedMotion: "reduce" });
            const tab = await context.newPage();
            await openPage(tab, path, account);
            const row = await tab.evaluate(() => {
                const bar = document.querySelector("header > div")!;
                const items = [...bar.querySelectorAll(":scope > a, :scope > nav, :scope > div")].map(item => item.getBoundingClientRect()).filter(box => box.width > 0);
                const centres = items.map(box => (box.top + box.bottom) / 2);
                const header = document.querySelector("header")!.getBoundingClientRect();
                const right = Math.max(...items.map(box => box.right));
                const content = bar.getBoundingClientRect().right - parseFloat(getComputedStyle(bar).paddingRight);
                return { height: header.height, spread: Math.max(...centres) - Math.min(...centres), overflow: right - content };
            });
            expect(row.spread, `${name} at ${viewportWidth} px: the items are on one row`).toBeLessThanOrEqual(2);
            expect(row.overflow, `${name} at ${viewportWidth} px: nothing past the content edge`).toBeLessThanOrEqual(1);
            heights.push(row.height);
            await context.close();
        }
        expect(heights[0], `at ${viewportWidth} px the two-role header is as tall as the one-role header`).toBe(heights[1]);
    }
});

const alignedPages = routes.filter(route => route.account && !["choose-role", "home", "sign-in", "registration", "forgot-password"].includes(route.name));
for (const route of alignedPages) {
    test(`${route.name}: the header content and the page title start at the same left edge`, async ({ page }) => {
        test.skip(width(page) !== 1280, "It sets its own widths.");
        for (const viewportWidth of [1024, 1280, 1440]) {
            await page.setViewportSize({ width: viewportWidth, height: 900 });
            await openPage(page, route.path, route.account);
            // A request page has its title inside the status card, so the card is the block that lines up with the header
            const edges = await page.evaluate(() => ({
                header: document.querySelector("header > div > a")!.getBoundingClientRect().left,
                title: (document.querySelector('section[aria-label="Request status"]') ?? document.querySelector("h1"))!.getBoundingClientRect().left,
            }));
            expect(edges.title, `${route.name} at ${viewportWidth} px: the title against the header brand`).toBeCloseTo(edges.header, 0);
        }
    });
}

// ---------------------------------------------------------------- the menus and dialogs
test("the More sheet: Tab stays inside it and Escape closes it and gives focus back", async ({ page }) => {
    test.skip(width(page) !== 375, "The More sheet is the phone menu.");
    await openPage(page, "/volunteer", fixtureAccounts.both);
    const more = page.getByRole("navigation", { name: "Mobile" }).getByRole("button", { name: "More" });
    await more.click();
    const sheet = page.getByRole("dialog", { name: "More" });
    await expect(sheet).toBeVisible();
    for (let press = 0; press < 12; press++) {
        await page.keyboard.press("Tab");
        const where = await page.evaluate(() => {
            const active = document.activeElement;
            return active === document.body || !!active?.closest("dialog") ? "inside" : `outside: ${active?.tagName} ${active?.textContent?.trim().slice(0, 20)}`;
        });
        expect(where, `after Tab ${press + 1}`).toBe("inside");
    }
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(more).toBeFocused();
});

test("the Account menu: Escape closes it and gives focus back to its button", async ({ page }) => {
    test.skip(width(page) !== 1280, "The Account menu is the wide header's.");
    await openPage(page, "/resident", fixtureAccounts.resident);
    const account = page.getByRole("banner").getByRole("button", { name: "Account" });
    await account.click();
    await expect(account).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(account).toHaveAttribute("aria-expanded", "false");
    await expect(account).toBeFocused();
});

test("a disabled confirm button shows its reason in the accept dialog", async ({ page }) => {
    await openPage(page, `/volunteer/requests/${fixtureRequests.Open}`, fixtureAccounts.volunteer);
    await page.getByRole("button", { name: "Accept request" }).click();
    const dialog = page.getByRole("dialog");
    const confirm = dialog.getByRole("button", { name: "Accept request" });
    await expect(confirm).toBeDisabled();
    const reason = await confirm.getAttribute("aria-describedby");
    await expect(page.locator(`#${reason}`)).toBeVisible();
    await expect(page.locator(`#${reason}`)).toHaveText(/Choose a pickup window|Accept the terms/);
});

test("the delivery dialog's buttons are visible at 375 x 667", async ({ page }) => {
    test.skip(width(page) !== 375, "Checked at 375 x 667.");
    await openPage(page, `/volunteer/requests/${fixtureRequests.Collected}`, fixtureAccounts.volunteer);
    await page.getByRole("button", { name: "Record delivery" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    for (const name of ["Cancel", "Record delivery"]) {
        const box = (await dialog.getByRole("button", { name }).last().boundingBox())!;
        expect(box.y + box.height, `${name} is above the bottom edge`).toBeLessThanOrEqual(667);
        expect(box.y, `${name} is below the top edge`).toBeGreaterThanOrEqual(0);
    }
});

test("the windows picker offers an overnight hour and the Today and Tomorrow buttons", async ({ page }) => {
    await openPage(page, "/resident/requests/new", fixtureAccounts.resident);
    await expect(page.getByRole("button", { name: "Today" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Tomorrow" }).first()).toBeVisible();
    const groups = await page.locator("select optgroup").evaluateAll(nodes => nodes.map(node => (node as HTMLOptGroupElement).label));
    expect(groups.some(label => /night/i.test(label)), groups.join(", ")).toBe(true);
});

// ---------------------------------------------------------------- every route
for (const route of routes) {
    test(`${route.name}: no skipped heading level`, async ({ page }) => {
        test.skip(![375, 1280].includes(width(page)), "Checked at 375 and 1280 px.");
        await openPage(page, route.path, route.account);
        // Headings that are on the page, not the title of a closed sheet or dialog
        const levels = await page.evaluate(() => [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")]
            .filter(heading => heading.checkVisibility()).map(heading => Number(heading.tagName[1])));
        expect(levels[0], `levels: ${levels.join(" ")}`).toBe(1);
        levels.slice(1).forEach((level, index) => expect(level - levels[index], `levels: ${levels.join(" ")}`).toBeLessThanOrEqual(1));
    });

    test(`${route.name}: the page does not scroll sideways`, async ({ page }) => {
        test.skip(![320, 375, 768].includes(width(page)), "Checked at 320, 375 and 768 px.");
        await openPage(page, route.path, route.account);
        const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(sideways, "pixels past the right edge").toBeLessThanOrEqual(0);
    });
}

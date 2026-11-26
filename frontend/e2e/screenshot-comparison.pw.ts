import { expect, test, type Page } from "@playwright/test";
import { fixtureAccounts, fixtureRequests } from "../mock/fixtures.mjs";
import { fontsLoaded, openPage, setupSession, width } from "./session";

const { resident, volunteer, both, empty } = fixtureAccounts;
const { Open, Assigned, Collected } = fixtureRequests;
const residentRequest = `/resident/requests/${Open}`;
const volunteerRequest = `/volunteer/requests/${Open}`;

// A low colour threshold catches subtle token changes. The dialogs can round fractional
// positions differently and shift a row of pixels, so allow a small ratio there only.
async function capture(page: Page, name: string, { dialog = false, fullPage = false } = {}) {
    await fontsLoaded(page);
    await expect(page).toHaveScreenshot(`${name}.png`, {
        fullPage,
        animations: "disabled",
        caret: "hide",
        threshold: 0.05,
        maxDiffPixelRatio: dialog ? 0.01 : 0.001,
    });
}

test.skip(process.platform !== "win32", "Reference screenshots were captured on Windows.");

test.beforeEach(({ page }) => {
    test.skip(width(page) !== 375 && width(page) !== 1280, "Reference screenshots use 375 and 1280 px.");
});

for (const [name, path, account] of [
    ["resident-open", residentRequest, resident],
    ["resident-assigned", `/resident/requests/${Assigned}`, resident],
    ["resident-collected", `/resident/requests/${Collected}`, resident],
    ["volunteer-available", "/volunteer", volunteer],
    ["volunteer-request", volunteerRequest, volunteer],
    ["registration", "/register", null],
    ["empty-list", "/resident", empty],
] as const) {
    test(name, async ({ page }) => {
        await openPage(page, path, account);
        await capture(page, name);
    });
}

test("resident list shows every status badge", async ({ page }) => {
    await openPage(page, "/resident", resident);
    await capture(page, "resident-list", { fullPage: true });
});

test("focused and hovered primary link", async ({ page }) => {
    await openPage(page, "/resident", empty);
    const link = page.getByRole("link", { name: "Create your first request" });
    await link.focus();
    await expect(link).toBeFocused();
    await expect(link).toHaveCSS("outline-style", "solid");
    await capture(page, "primary-focused");
    await link.blur();
    await link.hover();
    await capture(page, "primary-hovered");
});

test("registration validation errors", async ({ page }) => {
    await openPage(page, "/register", null);
    await page.getByRole("checkbox", { name: /accept the terms/i }).check();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByLabel("First name")).toHaveAttribute("aria-invalid", "true");
    await capture(page, "registration-invalid");
});

test("delivery dialog", async ({ page }) => {
    await openPage(page, `/volunteer/requests/${Collected}`, volunteer);
    await page.getByRole("button", { name: "Record delivery" }).click();
    const dialog = page.getByRole("dialog", { name: "Record delivery" });
    await expect(dialog.getByRole("group", { name: "Facility" })).toBeVisible();
    await page.mouse.move(0, 0);
    await capture(page, "delivery-dialog", { dialog: true });
});

test("disabled accept confirms with a reason", async ({ page }) => {
    await openPage(page, volunteerRequest, volunteer);
    await page.getByRole("button", { name: "Accept request" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Accept request" })).toBeDisabled();
    await expect(dialog.getByText(/Choose a pickup window|Accept the terms/)).toBeVisible();
    await page.mouse.move(0, 0);
    await capture(page, "accept-disabled", { dialog: true });
});

test("open header navigation", async ({ page }) => {
    await openPage(page, "/resident", both);
    const menu = width(page) === 375 ? "More" : "Account";
    await page.getByRole("button", { name: menu, exact: true }).click();
    await expect(page.getByRole("link", { name: "Profile", exact: true })).toBeVisible();
    await page.mouse.move(0, 0);
    await capture(page, `header-${menu.toLowerCase()}`);
});

test("404 page", async ({ page }) => {
    await setupSession(page, null);
    await page.goto("/does-not-exist");
    await expect(page.getByRole("main", { name: "We could not find that page." })).toBeVisible();
    await capture(page, "not-found");
});

test("list loading", async ({ page }) => {
    await setupSession(page, resident);
    // Hold the list request in this isolated page until the screenshot is taken.
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route(url => url.pathname === "/api/requests" && url.searchParams.has("view"), async route => {
        await held;
        await route.continue();
    });
    try {
        await page.goto("/resident");
        await expect(page.getByRole("status").filter({ hasText: /Loading your requests/i })).toBeVisible();
        await capture(page, "list-loading");
    } finally {
        release();
        await page.unrouteAll({ behavior: "wait" });
    }
});

test("request creation success notice", async ({ page }) => {
    await openPage(page, "/resident?created=1", resident);
    await expect(page.getByText("Your request was created.")).toBeVisible();
    await capture(page, "request-created-notice");
});

import { expect, test } from "@playwright/test";
import { fixtureAccounts, fixtureRequests } from "../mock/fixtures.mjs";
import { openPage, width } from "./session";

const { resident, both } = fixtureAccounts;
const { Assigned, Open } = fixtureRequests;

test.describe("remediation browser regressions", () => {
    test("REL-01: offline Confirm collected fails at once and does not fire after reconnect", async ({ page, context }) => {
        test.skip(width(page) !== 1280, "Network behaviour is viewport-independent.");
        await openPage(page, `/resident/requests/${Assigned}`, resident);
        const posts: string[] = [];
        page.on("request", req => {
            if (req.method() === "POST" && req.url().includes("/assignment/collected")) posts.push(req.url());
        });

        await context.setOffline(true);
        await expect(page.getByText(/You're offline/i)).toBeVisible();
        await page.getByRole("button", { name: "Confirm collected" }).click();
        await expect(page.locator("main").getByRole("alert")).toContainText(/could not reach the server/i);

        // Clear the failed offline attempt; reconnecting must send zero requests.
        posts.length = 0;
        await context.setOffline(false);
        await page.waitForTimeout(500);
        expect(posts).toEqual([]);
    });

    test("NAV-01 & NAV-02: Back from review keeps all typed values and draft survives navigation", async ({ page }) => {
        test.skip(width(page) !== 375, "Checked at phone width.");
        await openPage(page, "/resident/requests/new", resident);
        await page.getByLabel("Category").selectOption("laptops");
        await page.getByLabel("Quantity").fill("2");
        await page.getByRole("button", { name: "Tomorrow" }).click();
        await page.getByLabel("Start hour 1").selectOption("14");
        await page.getByLabel(/Notes/).fill("Side gate");

        await page.getByRole("button", { name: "Review" }).click();
        await expect(page.getByRole("heading", { name: "Review your request" })).toBeVisible();
        expect(page.url()).toContain("#review");

        await page.goBack();
        await expect(page.getByRole("heading", { name: "New pickup request" })).toBeVisible();
        await expect(page.getByLabel(/Notes/)).toHaveValue("Side gate");
        await expect(page.getByLabel("Quantity")).toHaveValue("2");

        // Navigate away and back: draft restored from sessionStorage
        await page.getByRole("link", { name: /Requests/i }).first().click();
        await expect(page.getByRole("heading", { name: "My requests" })).toBeVisible();
        await page.getByRole("link", { name: /New/i }).first().click();
        await expect(page.getByRole("heading", { name: "New pickup request" })).toBeVisible();
        await expect(page.getByLabel(/Notes/)).toHaveValue("Side gate");
    });

    test("NAV-06: resident list filter persists after reload", async ({ page }) => {
        test.skip(width(page) !== 1280, "Filter URL state is viewport-independent.");
        await openPage(page, "/resident", resident);
        await page.getByRole("button", { name: "Assigned", exact: true }).click();
        await expect(page).toHaveURL(/status=Assigned/);
        await page.reload();
        await expect(page.getByRole("button", { name: "Assigned", exact: true })).toHaveAttribute("aria-pressed", "true");
    });

    test("NAV-07: two-role account on /profile with no active role sees My requests and Available", async ({ page }) => {
        test.skip(![375, 1280].includes(width(page)), "Checked on phone and desktop navigation.");
        await openPage(page, "/profile", both);
        if (width(page) === 1280) {
            const nav = page.getByRole("navigation", { name: "Main" });
            await expect(nav.getByRole("link", { name: "My requests" })).toBeVisible();
            await expect(nav.getByRole("link", { name: "Available" })).toBeVisible();
        } else {
            const nav = page.getByRole("navigation", { name: "Mobile" });
            await expect(nav.getByRole("link", { name: "Requests" })).toBeVisible();
            await expect(nav.getByRole("link", { name: "Available" })).toBeVisible();
        }
    });

    test("A11Y-03: focused controls on new request are not hidden behind the mobile bottom bar", async ({ page }) => {
        test.skip(![320, 375, 768].includes(width(page)), "Mobile bottom bar is shown below 960 px.");
        await openPage(page, "/resident/requests/new", resident);
        const bar = (await page.getByRole("navigation", { name: "Mobile" }).boundingBox())!;
        for (const name of ["Today", "Tomorrow", "Add window", "Review"]) {
            const btn = page.getByRole("button", { name }).first();
            await btn.focus();
            await btn.scrollIntoViewIfNeeded();
            const box = (await btn.boundingBox())!;
            expect(box.y + box.height, `"${name}" should not be covered by bottom bar`).toBeLessThanOrEqual(bar.y + 1);
        }
    });

    test("SEC-01: security response headers are present and X-Powered-By is removed", async ({ page }) => {
        test.skip(width(page) !== 1280, "Headers are viewport-independent.");
        const response = await page.goto(`/resident/requests/${Open}`);
        const headers = response!.headers();
        expect(headers["x-powered-by"]).toBeUndefined();
        expect(headers["x-content-type-options"]).toBe("nosniff");
        expect(headers["x-frame-options"]).toBe("DENY");
        expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
        expect(headers["content-security-policy-report-only"]).toBeUndefined();
        const csp = headers["content-security-policy"];
        expect(csp).toBeDefined();
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).toContain("object-src 'none'");
        expect(csp).toContain("worker-src 'self'");
        expect(csp).not.toContain("unsafe-eval");
    });
});

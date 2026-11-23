import { expect, type Page } from "@playwright/test";
import { mockNow } from "./fixtures";
import type { BrowserRoute } from "./routes";

export async function openRoute(page: Page, route: BrowserRoute): Promise<void> {
    await page.clock.setFixedTime(new Date(mockNow));
    await page.addInitScript(account => {
        sessionStorage.setItem("e2e-account", account ?? "");
    }, route.account);
    const response = await page.goto(route.path);
    expect(response?.ok(), `HTTP response for ${route.path}`).toBe(true);
    await expect(page).toHaveURL(route.destination ?? route.path);
    await expect(page.getByRole("heading", { level: 1, name: route.heading, exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /Loading/i })).toHaveCount(0);
}

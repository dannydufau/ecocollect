import { expect, type Page } from "@playwright/test";
import { setupSession } from "./session";
import type { BrowserRoute } from "./routes";

export async function openRoute(page: Page, route: BrowserRoute): Promise<void> {
    await setupSession(page, route.account);
    const response = await page.goto(route.path);
    expect(response?.ok(), `HTTP response for ${route.path}`).toBe(true);
    await expect(page).toHaveURL(route.destination ?? route.path);
    await expect(page.getByRole("heading", { level: 1, name: route.heading, exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /Loading/i })).toHaveCount(0);
}

import { expect, type Page } from "@playwright/test";
import { mockNow } from "./fixtures";

// A fixed clock and a fresh mock session for each browser test.
export async function setupSession(page: Page, account: string | null): Promise<void> {
    await page.clock.setFixedTime(new Date(mockNow));
    await page.addInitScript(id => sessionStorage.setItem("e2e-account", id ?? ""), account);
}

export async function openPage(page: Page, path: string, account: string | null): Promise<void> {
    await setupSession(page, account);
    await page.goto(path);
    await page.locator("h1").first().waitFor();
    await expect(page.getByRole("status").filter({ hasText: /Loading/i })).toHaveCount(0);
    await fontsLoaded(page);
}

// The fonts are asked for when the text is first laid out, which can be after fonts.ready first resolves.
// So wait two frames and then for the fonts again, or a width measured now can still change.
export async function fontsLoaded(page: Page): Promise<void> {
    await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await document.fonts.ready;
    });
}

export const width = (page: Page) => page.viewportSize()!.width;

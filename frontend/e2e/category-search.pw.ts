import { expect, test } from "@playwright/test";
import { fixtureAccounts } from "../mock/fixtures.mjs";
import { openPage, width } from "./session";

const { resident } = fixtureAccounts;

test("resident can search categories by alias on a narrow phone, keep selection while filtering, and block duplicates", async ({ page }) => {
    test.skip(width(page) !== 375, "Checked on narrow mobile width.");
    await openPage(page, "/resident/requests/new", resident);

    // Search by alias in Item 1
    const item1 = page.getByRole("group", { name: "Item 1" });
    const search1 = item1.getByLabel("Search categories");
    await search1.fill("cell phone");
    const select1 = item1.getByLabel("Category");
    await expect(select1.getByRole("option", { name: "Phones" })).toBeAttached();
    await select1.selectOption("phones");
    await expect(select1).toHaveValue("phones");

    // Filtering to something else keeps the chosen option selected
    await search1.fill("monitor");
    await expect(select1).toHaveValue("phones");

    // Add Item 2: Phones must stay disabled even when searched
    await page.getByRole("button", { name: "Add another item" }).click();
    const item2 = page.getByRole("group", { name: "Item 2" });
    await item2.getByLabel("Search categories").fill("phone");
    await expect(item2.getByLabel("Category").getByRole("option", { name: "Phones" })).toBeDisabled();

    // No-results state + Clear search restores all options
    await item2.getByLabel("Search categories").fill("unmatched item");
    await expect(item2.getByRole("status")).toContainText("No categories match");
    await item2.getByRole("button", { name: "Clear search" }).click();
    await expect(item2.getByLabel("Search categories")).toHaveValue("");
    await expect(item2.getByLabel("Category").getByRole("option", { name: "Monitors" })).toBeAttached();
});

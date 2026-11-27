import { expect, test } from "@playwright/test";
import { fixtureAccounts, fixtureRequests } from "../mock/fixtures.mjs";
import { openPage, width } from "./session";

// Minimal valid 1x1 PNG bytes so createImageBitmap succeeds in Chromium
const TINY_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
    "base64",
);

const { resident, volunteer } = fixtureAccounts;
const { Collected } = fixtureRequests;

test.describe("mobile photo capture inputs", () => {
    test("resident new-request form exposes Take photo and Choose photo and uploads via camera input", async ({ page }) => {
        test.skip(width(page) !== 375, "Checked at mobile width.");
        await openPage(page, "/resident/requests/new", resident);

        const cameraInput = page.getByLabel("Take photo");
        const chooseInput = page.getByLabel("Choose photo");
        await expect(cameraInput).toHaveAttribute("capture", "environment");
        await expect(chooseInput).not.toHaveAttribute("capture");

        await cameraInput.setInputFiles({ name: "laptop.png", mimeType: "image/png", buffer: TINY_PNG });
        await expect(page.getByText("Uploaded")).toBeVisible();
        await expect(page.getByRole("img", { name: "Photo of the items" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Remove photo" })).toBeVisible();
    });

    test("volunteer delivery dialog requires an uploaded evidence photo and accepts Take photo", async ({ page }) => {
        test.skip(width(page) !== 375, "Checked at mobile width.");
        await openPage(page, `/volunteer/requests/${Collected}`, volunteer);

        await page.getByRole("button", { name: "Record delivery" }).click();
        const dialog = page.getByRole("dialog", { name: "Record delivery" });
        await expect(dialog).toBeVisible();

        const confirm = dialog.getByRole("button", { name: "Record delivery" });
        await expect(confirm).toBeDisabled();

        // Pick an eligible facility first — confirm should still stay disabled without a photo
        await dialog.getByText("Demo Recycling Facility").click();
        await expect(confirm).toBeDisabled();

        // Upload delivery photo via the camera input
        const cameraInput = dialog.getByLabel("Take photo");
        await expect(cameraInput).toHaveAttribute("capture", "environment");
        await cameraInput.setInputFiles({ name: "depot.png", mimeType: "image/png", buffer: TINY_PNG });
        await expect(dialog.getByText("Uploaded")).toBeVisible();
        await expect(confirm).toBeEnabled();

        // Removing the photo disables confirm again
        await dialog.getByRole("button", { name: "Remove photo" }).click();
        await expect(confirm).toBeDisabled();
    });
});

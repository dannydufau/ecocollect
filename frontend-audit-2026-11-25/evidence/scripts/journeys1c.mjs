import { A, R, open, go, path, active, test, browser, stopMock, S } from "./lib.mjs";
import { writeFileSync } from "node:fs";
{ const p = await browser.newPage(); const b64 = await p.evaluate(() => { const c = document.createElement("canvas"); c.width = 640; c.height = 480; const x = c.getContext("2d"); x.fillStyle = "#5E7045"; x.fillRect(0, 0, 640, 480); return c.toDataURL("image/png").split(",")[1]; }); writeFileSync(`${S}/test-photo.png`, Buffer.from(b64, "base64")); await p.close(); }
const file = `${S}/test-photo.png`;
async function fill(page) {
  await page.getByLabel("Category").selectOption({ index: 1 });
  if (!(await page.getByLabel("Date 1").count())) await page.getByRole("button", { name: "Add window" }).click();
  await page.getByLabel("Date 1").fill("2026-11-25"); await page.getByLabel("Start hour 1").selectOption("14");
}
await test("J3-control upload completes normally", async log => {
  const { page, ctx } = await open(A.resident, "/resident/requests/new");
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByText("Uploaded", { exact: true }).waitFor();
  log("upload finished", true);
  await ctx.close();
});
await test("J3 Review while a valid photo is still uploading", async log => {
  const { page, ctx, posts } = await open(A.resident, "/resident/requests/new");
  let held = 0;
  await page.route("**/api/uploads", async route => { held++; await new Promise(r => setTimeout(r, 6000)); await route.continue().catch(() => {}); });
  await fill(page);
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByText("Uploading...").waitFor(); await page.waitForTimeout(700);
  log("upload ticket request held / still 'Uploading...'", [held, await page.getByText("Uploading...").count()]);
  log("Review button enabled", await page.getByRole("button", { name: "Review" }).isEnabled());
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("heading", { name: "Review your request" }).waitFor();
  log("photo on review step", await page.getByRole("img", { name: "Photo of item" }).count());
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirm and send" }).click(); await page.waitForURL(/created=/);
  log("POST /api/requests items", JSON.parse(posts.find(p => p.p === "/api/requests").body).items);
  await ctx.close();
});
await test("J3c edit page: Save while a replacement photo is uploading", async log => {
  const { page, ctx, posts } = await open(A.resident, `/resident/requests/${R.Open}/edit`);
  await page.route("**/api/uploads", async route => { await new Promise(r => setTimeout(r, 6000)); await route.continue().catch(() => {}); });
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByText("Uploading...").waitFor();
  log("Save changes enabled while uploading", await page.getByRole("button", { name: "Save changes" }).isEnabled());
  await page.getByRole("button", { name: "Save changes" }).click(); await page.waitForTimeout(2000);
  log("after Save: url", path(page));
  log("PATCH body", posts.find(p => p.m === "PATCH")?.body ?? "(none sent)");
  await ctx.close();
});
await test("J3b upload ticket request that never answers", async log => {
  const { page, ctx } = await open(A.resident, "/resident/requests/new");
  let held = 0; await page.route("**/api/uploads", () => { held++; });
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByText("Uploading...").waitFor();
  await page.waitForTimeout(45000);
  log("after 45 s: requests held / 'Uploading...' still shown", [held, await page.getByText("Uploading...").count()]);
  log("cancel, remove or retry control", await page.getByRole("button", { name: /cancel|remove photo|retry/i }).allInnerTexts());
  log("can the person choose another file", await page.locator('input[type=file]').isEnabled());
  await ctx.close();
});
await browser.close(); stopMock();

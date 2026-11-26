import AxeBuilder from "@axe-core/playwright";
import { A, R, open, test, browser, stopMock, S } from "./lib.mjs";
await test("Report missed dialog (allowedActions patched in the GET response)", async log => {
  const { page, ctx, posts } = await open(A.resident, null);
  await page.route(`**/api/requests/${R.Assigned}`, async route => { const res = await route.fetch(); const body = await res.json(); body.allowedActions = ["confirm_collected", "report_missed"]; body.refreshAt = null; await route.fulfill({ response: res, json: body }); });
  await page.goto(`http://127.0.0.1:3100/resident/requests/${R.Assigned}`); await page.locator("h1").waitFor(); await page.waitForTimeout(700);
  await page.getByRole("button", { name: "Report missed pickup" }).click(); const d = page.getByRole("dialog"); await page.waitForTimeout(500);
  log("axe", (await new AxeBuilder({ page }).analyze()).violations.map(v => v.id));
  await page.screenshot({ path: `${S}/audit-shots/dlg-report-missed.png` });
  await d.getByRole("checkbox", { name: /create a new request/i }).check();
  if (!(await d.getByLabel("Date 1").count())) await d.getByRole("button", { name: "Add window" }).click();
  await d.getByLabel("Date 1").fill("2026-11-27"); await d.getByLabel("Start hour 1").selectOption("10");
  await d.getByRole("button", { name: "Add window" }).click(); await d.getByLabel("Date 2").fill("2026-11-28");
  await d.getByRole("checkbox", { name: /terms|agree|accept|read/i }).check();
  const confirm = d.getByRole("button", { name: "Report missed pickup" });
  log("confirm enabled with window 2 half filled", await confirm.isEnabled());
  await confirm.click(); await page.waitForTimeout(2000);
  log("body sent", posts.find(p => p.p.endsWith("/missed"))?.body ?? "(none)");
  await ctx.close();
});
await test("Resident cancel-assignment dialog: one new window, hour left empty", async log => {
  const { page, ctx, posts } = await open(A.resident, `/resident/requests/${R.Assigned}`);
  await page.getByRole("button", { name: "Cancel assignment" }).click(); const d = page.getByRole("dialog");
  if (!(await d.getByLabel("Date 1").count())) await d.getByRole("button", { name: "Add window" }).click();
  await d.getByLabel("Date 1").fill("2026-11-28");
  await d.getByRole("button", { name: "Cancel assignment" }).click(); await page.waitForTimeout(2000);
  log("body sent", posts.find(p => p.p.endsWith("/assignment/cancel"))?.body ?? "(none)");
  log("messages", (await page.locator("main [role=status], main [role=alert]").allInnerTexts()).filter(Boolean));
  await ctx.close();
});
await test("501-character reason in the two dialogs", async log => {
  const { page, ctx } = await open(A.resident, `/resident/requests/${R.Open}`);
  await page.getByRole("button", { name: "Cancel request" }).click(); const d = page.getByRole("dialog");
  await d.getByRole("textbox").fill("x".repeat(501));
  log("cancel-request field accepts length", (await d.getByRole("textbox").inputValue()).length);
  await ctx.close();
});
await browser.close(); stopMock();

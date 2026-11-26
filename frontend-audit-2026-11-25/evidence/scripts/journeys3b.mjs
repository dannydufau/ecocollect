import { A, R, open, go, path, active, test, browser, stopMock, base } from "./lib.mjs";
const msgs = async page => (await page.locator('[role=status],[role=alert]').allInnerTexts()).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean);
await test("J17b action pressed while offline, then connection returns", async log => {
  const { page, ctx, posts } = await open(A.resident, `/resident/requests/${R.Assigned}`);
  const sent = () => posts.filter(p => p.p.endsWith("/collected")).length;
  const group = page.getByRole("region", { name: "Request actions" });
  await ctx.setOffline(true); await page.waitForTimeout(500);
  await group.getByRole("button").first().click(); await page.waitForTimeout(8000);
  log("8 s offline: first button / disabled", [await group.getByRole("button").first().innerText(), await group.getByRole("button").first().isDisabled()]);
  log("8 s offline: requests sent / messages", [sent(), await msgs(page)]);
  await page.getByRole("link", { name: "Back to my requests" }).click(); await page.waitForTimeout(1500);
  log("user gives up and leaves; url", path(page));
  await ctx.setOffline(false); await page.waitForTimeout(3000);
  log("after reconnect: POST /collected sent", sent());
  await page.locator(`a[href="/resident/requests/${R.Assigned}"]`).first().click(); await page.waitForTimeout(1500);
  log("request status now", (await page.getByRole("region", { name: "Request status" }).innerText()).replace(/\s+/g, " ").slice(0, 120));
  await ctx.close();
});
await test("J17c create request pressed while offline", async log => {
  const { page, ctx, posts } = await open(A.resident, "/resident/requests/new");
  await page.getByLabel("Category").selectOption({ index: 1 });
  if (!(await page.getByLabel("Date 1").count())) await page.getByRole("button", { name: "Add window" }).click();
  await page.getByLabel("Date 1").fill("2026-11-25"); await page.getByLabel("Start hour 1").selectOption("14");
  await page.getByRole("button", { name: "Review" }).click(); await page.getByRole("checkbox").check();
  await ctx.setOffline(true);
  await page.getByRole("button", { name: "Confirm and send" }).click(); await page.waitForTimeout(3000);
  log("offline message (create uses a plain fetch, not a query mutation)", await msgs(page));
  await ctx.setOffline(false);
  await ctx.close();
});
await test("J19b stats page with an HTML 200, waited 12 s", async log => {
  const { page, ctx } = await open(A.resident, null);
  await page.route(/\/api\/public\/stats/, route => route.fulfill({ status: 200, contentType: "text/html", body: "<h1>portal</h1>" }));
  await page.goto(base + "/stats"); await page.waitForTimeout(12000);
  log("shows", (await page.locator("main").first().innerText()).replace(/\s+/g, " ").slice(0, 160));
  await ctx.close();
});
await test("J20b real double-click on the volunteer cancel confirm button", async log => {
  const { page, ctx, posts } = await open(A.volunteer, `/volunteer/requests/${R.Assigned}`);
  await page.route("**/assignment/cancel", async route => { await new Promise(r => setTimeout(r, 800)); route.continue(); });
  await page.getByRole("button", { name: "Cancel assignment" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel assignment" }).dblclick({ force: true }).catch(() => {});
  await page.waitForTimeout(2000);
  log("cancel POSTs after a real double-click", posts.filter(p => p.p.endsWith("/cancel")).length);
  await ctx.close();
});
await test("J22 text limits: 600-character notes and cancel reason", async log => {
  const { page, ctx } = await open(A.resident, "/resident/requests/new");
  await page.getByLabel("Notes").fill("x".repeat(600));
  log("notes accepted by the field (length)", (await page.getByLabel("Notes").inputValue()).length);
  log("limit or counter shown", await page.getByText(/500/).count());
  await ctx.close();
});
await browser.close(); stopMock();

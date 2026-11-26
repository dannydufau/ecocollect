import { A, R, open, test, browser, stopMock, S } from "./lib.mjs";
const slow = page => page.route("**/api/**", async route => { if (route.request().method() !== "GET" && !route.request().url().endsWith("/api/session") && !route.request().url().endsWith("/api/uploads")) await new Promise(r => setTimeout(r, 800)); route.continue().catch(() => {}); });
const dbl = async loc => { await loc.dblclick({ force: true }).catch(() => {}); };
const count = (posts, re) => posts.filter(p => re.test(p.p) && p.m !== "DELETE" || (re.test(p.p) && p.p === "/api/profile")).length;
await test("double-click: volunteer accept", async log => {
  const { page, ctx, posts } = await open(A.volunteer, `/volunteer/requests/${R.Open}`); await slow(page);
  await page.getByRole("button", { name: "Accept request" }).click(); const d = page.getByRole("dialog");
  await d.getByRole("checkbox").check(); const radios = d.getByRole("radio"); if (!(await radios.first().isChecked())) await radios.first().check({ force: true });
  await dbl(d.getByRole("button", { name: "Accept request" })); await page.waitForTimeout(2500);
  log("assignment POSTs", posts.filter(p => /\/assignment$/.test(p.p)).length);
  log("messages", (await page.locator("[role=status],[role=alert]").allInnerTexts()).filter(Boolean));
});
await test("double-click: record delivery", async log => {
  const { page, ctx, posts } = await open(A.volunteer, `/volunteer/requests/${R.Collected}`); await slow(page);
  await page.getByRole("button", { name: "Record delivery" }).click(); const d = page.getByRole("dialog");
  await d.getByRole("radio").first().check({ force: true });
  await d.locator("input[type=file]").setInputFiles(`${S}/test-photo.png`); await d.getByText("Uploaded", { exact: true }).waitFor();
  const buttons = d.getByRole("button"); await dbl(buttons.last()); await page.waitForTimeout(2500);
  log("delivery POSTs", posts.filter(p => /\/delivery$/.test(p.p)).length);
});
await test("double-click: add second role", async log => {
  const { page, ctx, posts } = await open(A.resident, "/profile"); await slow(page);
  await page.getByRole("button", { name: "Become a volunteer" }).click(); await page.waitForTimeout(400);
  const d = page.getByRole("dialog"); const scope = (await d.count()) ? d : page.locator("main");
  const code = scope.getByLabel(/postal code/i).first(); if (await code.count()) await code.fill("T2P 1J9");
  const box = scope.getByRole("checkbox"); if (await box.count()) await box.first().check();
  await dbl(scope.getByRole("button", { name: /volunteer|add|activate|confirm/i }).last()); await page.waitForTimeout(2500);
  log("role POSTs", posts.filter(p => p.p === "/api/profile/roles").length);
});
await test("double-click: deactivate account", async log => {
  const { page, ctx, posts } = await open(A.empty, "/profile"); await slow(page);
  await page.getByRole("button", { name: "Deactivate account" }).click(); const d = page.getByRole("dialog");
  log("dialog text", (await d.innerText()).replace(/\s+/g, " ").slice(0, 220));
  const box = d.getByRole("checkbox"); if (await box.count()) await box.first().check();
  await dbl(d.getByRole("button", { name: /deactivate/i }).last()); await page.waitForTimeout(2500);
  log("DELETE /api/profile requests", posts.filter(p => p.p === "/api/profile" && p.m === "DELETE").length);
});
await test("double-click: save public name", async log => {
  const { page, ctx, posts } = await open(A.resident, "/profile"); await slow(page);
  await page.getByRole("button", { name: "Edit public name" }).click(); await page.getByLabel("Public name").fill("Riley Q.");
  await dbl(page.getByRole("button", { name: "Save" })); await page.waitForTimeout(2500);
  log("PATCH requests", posts.filter(p => p.m === "PATCH").length);
});
await browser.close(); stopMock();

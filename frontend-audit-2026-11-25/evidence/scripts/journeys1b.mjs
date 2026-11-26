import { A, R, open, go, path, active, test, browser, stopMock } from "./lib.mjs";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhWMjWQAAAABJRU5ErkJggg==", "base64");
await test("J2 (clean) row 2 has a date but no hour", async log => {
  const { page, ctx, posts } = await open(A.resident, "/resident/requests/new");
  await page.getByLabel("Category").selectOption({ index: 1 });
  log("rows at start", await page.getByLabel(/^Date \d$/).count());
  if (!(await page.getByLabel("Date 1").count())) await page.getByRole("button", { name: "Add window" }).click();
  await page.getByLabel("Date 1").fill("2026-11-25"); await page.getByLabel("Start hour 1").selectOption("14");
  await page.getByRole("button", { name: "Add window" }).click();
  await page.getByLabel("Date 2").fill("2026-11-26");
  await page.getByRole("button", { name: "Review" }).click(); await page.waitForTimeout(600);
  log("heading", await page.locator("h1").first().innerText());
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirm and send" }).click(); await page.waitForURL(/created=/);
  log("windows actually sent", JSON.parse(posts.find(p => p.p === "/api/requests").body).windows);
});
await test("J3b upload request that never answers", async log => {
  const { page, ctx } = await open(A.resident, "/resident/requests/new");
  let held = 0;
  await page.route("**/api/uploads", () => { held++; });
  await page.locator('input[type=file]').first().setInputFiles({ name: "item.png", mimeType: "image/png", buffer: png });
  const box = page.locator('input[type=file]').first().locator("xpath=ancestor::div[2]");
  for (const t of [2, 10, 20, 40]) { await page.waitForTimeout((t === 2 ? 2 : t === 10 ? 8 : t === 20 ? 10 : 20) * 1000); log(`picker text at ${t}s (held=${held})`, (await box.innerText()).replace(/\n+/g, " | ").slice(-160)); }
  await ctx.close();
});
await browser.close(); stopMock();

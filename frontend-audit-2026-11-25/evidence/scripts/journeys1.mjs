import { A, R, open, go, path, active, test, browser, stopMock } from "./lib.mjs";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhWMjWQAAAABJRU5ErkJggg==", "base64");
async function fillRequest(page) {
  await page.getByLabel("Category").first().selectOption({ index: 1 });
  await page.getByLabel("Quantity").first().fill("3");
  await page.getByRole("button", { name: "Add window" }).click().catch(() => {});
  if (!(await page.getByLabel("Date 1").count())) await page.getByRole("button", { name: "Add window" }).click();
  await page.getByLabel("Date 1").fill("2026-11-25");
  await page.getByLabel("Start hour 1").selectOption("14");
}
const windowsCount = page => page.getByLabel(/^Date \d$/).count();

await test("J1 browser Back on the review step", async log => {
  const { page, ctx } = await open(A.resident, "/resident");
  await page.getByRole("link", { name: "New request" }).first().click();
  await page.getByRole("heading", { name: "New pickup request" }).waitFor();
  await fillRequest(page);
  await page.getByLabel("Notes").fill("Ring the bell twice");
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("heading", { name: "Review your request" }).waitFor();
  log("url on review step", path(page));
  await page.goBack(); await page.waitForTimeout(800);
  log("url after browser Back", path(page));
  log("heading after Back", await page.locator("h1").first().innerText());
  await page.goForward(); await page.waitForTimeout(800);
  log("after Forward: url / heading / notes value", [path(page), await page.locator("h1").first().innerText(), await page.getByLabel("Notes").inputValue().catch(() => "(no field)")]);
  await ctx.close();
});

await test("J2 half-filled second window", async log => {
  const { page, ctx } = await open(A.resident, "/resident/requests/new");
  await fillRequest(page);
  await page.getByRole("button", { name: "Add window" }).click();
  await page.getByLabel(`Date ${await windowsCount(page)}`).fill("2026-11-26");
  log("window rows on the form", await windowsCount(page));
  await page.getByRole("button", { name: "Review" }).click();
  await page.waitForTimeout(600);
  log("heading after Review", await page.locator("h1").first().innerText());
  log("windows shown on review", await page.getByRole("region", { name: "Pickup windows" }).locator("li").allInnerTexts().catch(() => []));
  log("any error text", await page.locator('[role=alert], [aria-invalid=true]').allInnerTexts());
  await ctx.close();
});

await test("J3 Review while a photo is still uploading", async log => {
  const { page, ctx, posts } = await open(A.resident, "/resident/requests/new");
  await page.route("**/api/uploads", async route => { await new Promise(r => setTimeout(r, 6000)); await route.continue().catch(() => {}); });
  await fillRequest(page);
  await page.locator('input[type=file]').first().setInputFiles({ name: "item.png", mimeType: "image/png", buffer: png });
  await page.getByText("Uploading...").waitFor();
  log("Review button enabled while uploading", await page.getByRole("button", { name: "Review" }).isEnabled());
  await page.getByRole("button", { name: "Review" }).click();
  await page.getByRole("heading", { name: "Review your request" }).waitFor();
  log("photo shown on review", await page.getByRole("img", { name: "Photo of item" }).count());
  log("any upload warning on review", await page.getByText(/upload/i).filter({ visible: true }).allInnerTexts());
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Confirm and send" }).click();
  await page.waitForURL(/created=/);
  const create = posts.find(p => p.p === "/api/requests");
  log("POST /api/requests body", create?.body);
  await ctx.close();
});

await test("J3b upload that never answers: can it be cancelled?", async log => {
  const { page, ctx } = await open(A.resident, "/resident/requests/new");
  await page.route("**/api/uploads", () => {});
  await page.locator('input[type=file]').first().setInputFiles({ name: "item.png", mimeType: "image/png", buffer: png });
  await page.getByText("Uploading...").waitFor();
  await page.waitForTimeout(20000);
  log("after 20 s: still 'Uploading...'", await page.getByText("Uploading...").count());
  log("Cancel / Remove / Retry buttons", await page.getByRole("button", { name: /cancel|remove photo|retry/i }).count());
  await ctx.close();
});

await test("J4 leaving a filled form from the header", async log => {
  const { page, ctx } = await open(A.resident, "/resident/requests/new", { w: 1280, h: 900 });
  await fillRequest(page);
  await page.getByLabel("Notes").fill("A long note I typed");
  let dialogs = 0; page.on("dialog", d => { dialogs++; d.dismiss(); });
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "My requests" }).click();
  await page.waitForURL(/\/resident$/);
  await page.goBack(); await page.waitForTimeout(800);
  log("warning dialogs shown", dialogs);
  log("after coming Back: url, notes", [path(page), await page.getByLabel("Notes").inputValue()]);
  await page.getByLabel("Notes").fill("Typed again");
  await page.reload(); await page.getByLabel("Notes").waitFor();
  log("after reload: notes / beforeunload dialogs", [await page.getByLabel("Notes").inputValue(), dialogs]);
  await ctx.close();
});

await test("J5 Back after saving an edit", async log => {
  const { page, ctx } = await open(A.resident, "/resident");
  await page.locator(`a[href="/resident/requests/${R.Open}"]`).first().click();
  await page.getByRole("link", { name: "Edit request" }).click();
  await page.getByRole("heading", { name: "Edit request" }).waitFor();
  await page.getByLabel("Notes").fill("Back door");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(new RegExp(`${R.Open}$`));
  await page.waitForTimeout(800);
  log("after save", path(page));
  await page.goBack(); await page.waitForTimeout(900);
  log("browser Back from detail goes to", path(page));
  await ctx.close();
});

await test("J6 list filter after opening a detail and going Back", async log => {
  const { page, ctx } = await open(A.resident, "/resident");
  await page.getByRole("button", { name: "Assigned", exact: true }).or(page.getByRole("tab", { name: "Assigned", exact: true })).first().click();
  await page.waitForTimeout(500);
  const links = () => page.locator('main a[href^="/resident/requests/1"]').count();
  log("cards with Assigned filter", await links());
  await page.locator(`a[href="/resident/requests/${R.Assigned}"]`).first().click();
  await page.waitForURL(new RegExp(R.Assigned)); await page.waitForTimeout(600);
  await page.goBack(); await page.waitForTimeout(900);
  log("url after Back", path(page));
  log("cards after Back (7+ means the filter was reset)", await links());
  await ctx.close();
});

await test("J7 'created' banner after reload", async log => {
  const { page, ctx } = await open(A.resident, "/resident?created=2");
  const banner = () => page.locator('[role=status]').filter({ hasText: /created|request/i }).allInnerTexts();
  log("banner", await banner());
  await page.reload(); await page.waitForTimeout(1200);
  log("banner after reload", await banner());
  await ctx.close();
});
await browser.close(); stopMock();

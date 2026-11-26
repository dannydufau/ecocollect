import { A, R, open, go, path, active, test, browser, stopMock } from "./lib.mjs";
const statusTexts = async page => (await page.locator('[role=status],[role=alert]').allInnerTexts()).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean);
const dialog = page => page.getByRole("dialog");

await test("J8 volunteer cancels an assignment", async log => {
  const { page, ctx, posts } = await open(A.volunteer, `/volunteer/requests/${R.Assigned}`);
  await page.getByRole("button", { name: "Cancel assignment" }).click();
  await dialog(page).getByRole("button", { name: "Cancel assignment" }).click();
  await page.waitForURL(/history/); await page.waitForTimeout(900);
  log("lands on", path(page));
  log("status/alert messages on arrival", await statusTexts(page));
  log("focus", await active(page));
  await ctx.close();
});

await test("J9 Q12 answers 404 because the cancel expired the request (contract open point #471-1)", async log => {
  const { page, ctx } = await open(A.volunteer, `/volunteer/requests/${R.Assigned}`);
  let cancelled = false;
  await page.route(`**/api/requests/${R.Assigned}/assignment/cancel`, route => { cancelled = true; return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { code: "request_unavailable", message: "This request is no longer available." } }) }); });
  await page.route(`**/api/requests/${R.Assigned}`, route => cancelled ? route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { code: "request_unavailable", message: "x" } }) }) : route.continue());
  await page.getByRole("button", { name: "Cancel assignment" }).click();
  await dialog(page).getByRole("button", { name: "Cancel assignment" }).click();
  await page.waitForTimeout(2000);
  log("url", path(page));
  log("what the volunteer sees", (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 200));
  log("dialog still open", await dialog(page).count());
  await ctx.close();
});

await test("J10 focus and announcement after accepting", async log => {
  const { page, ctx } = await open(A.volunteer, `/volunteer/requests/${R.Open}`);
  await page.getByRole("button", { name: "Accept request" }).click();
  log("focus when dialog opens", await active(page));
  await dialog(page).getByRole("checkbox").check();
  const radios = dialog(page).getByRole("radio"); if (await radios.count() && !(await radios.first().isChecked())) await radios.first().check({ force: true });
  await dialog(page).getByRole("button", { name: "Accept request" }).click();
  await page.getByText("You accepted this request.").waitFor(); await page.waitForTimeout(700);
  log("focus after success", await active(page));
  log("status/alert nodes", await statusTexts(page));
  await ctx.close();
});

for (const [label, id, open_, confirm] of [["J11 focus after resident cancels the request", R.Open, "Cancel request", "Cancel request"], ["J11b focus after resident cancels the assignment", R.Assigned, "Cancel assignment", "Cancel assignment"]]) {
  await test(label, async log => {
    const { page, ctx } = await open(A.resident, `/resident/requests/${id}`);
    await page.getByRole("button", { name: open_ }).click();
    if (open_ === "Cancel request") log("dialog text", (await dialog(page).innerText()).replace(/\s+/g, " "));
    await dialog(page).getByRole("button", { name: confirm }).click();
    await page.waitForTimeout(1500);
    log("dialog open", await dialog(page).count());
    log("focus after success", await active(page));
    log("status/alert nodes", await statusTexts(page));
    await ctx.close();
  });
}

await test("J11c Escape and Cancel give focus back to the trigger", async log => {
  const { page, ctx } = await open(A.resident, `/resident/requests/${R.Open}`);
  await page.getByRole("button", { name: "Cancel request" }).focus(); await page.keyboard.press("Enter");
  await page.keyboard.press("Escape"); await page.waitForTimeout(500);
  log("focus after Escape", await active(page));
  await ctx.close();
});

await test("J12 Confirm collected (one press, no confirmation) and focus", async log => {
  const { page, ctx, posts } = await open(A.resident, `/resident/requests/${R.Assigned}`);
  await page.getByRole("button", { name: "Confirm collected" }).dblclick(); await page.waitForTimeout(1500);
  log("collected POSTs after a double click", posts.filter(p => p.p.endsWith("/collected")).length);
  log("dialogs", await dialog(page).count());
  log("focus after success", await active(page));
  log("status/alert nodes", await statusTexts(page));
  await ctx.close();
});

await test("J13 profile editor focus", async log => {
  const { page, ctx } = await open(A.resident, "/profile");
  const edit = page.getByRole("button", { name: /edit/i }).first();
  await edit.focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(500);
  log("focus right after opening the editor", await active(page));
  await page.getByRole("button", { name: "Cancel" }).click(); await page.waitForTimeout(400);
  log("focus after Cancel", await active(page));
  await ctx.close();
});

await test("J13b new request: focus and rows when adding/removing", async log => {
  const { page, ctx } = await open(A.volunteer, "/profile");
  const edit = page.getByRole("button", { name: /postal/i }).first();
  await edit.click(); await page.waitForTimeout(300);
  const add = page.getByRole("button", { name: /add/i }).first(); await add.click();
  log("focus after Add postal code", await active(page));
  const rm = page.getByRole("button", { name: /remove/i }).first(); if (await rm.count()) { await rm.click(); await page.waitForTimeout(200); log("focus after Remove", await active(page)); }
  await ctx.close();
});

await test("J14 session expires while on a request page (401 on an action)", async log => {
  const { page, ctx } = await open(A.resident, `/resident/requests/${R.Assigned}`);
  await page.route("**/api/**", route => route.fulfill({ status: 401, contentType: "application/json", body: '{"error":{"code":"unauthorized","message":"Please log in again."}}' }));
  await page.getByRole("button", { name: "Confirm collected" }).click();
  await page.waitForURL(/login/); await page.waitForTimeout(1500);
  log("lands on", path(page));
  log("saved return page (sessionStorage returnTo)", await page.evaluate(() => sessionStorage.getItem("returnTo")));
  await ctx.close();
});
await test("J14b session already expired when a protected deep link loads", async log => {
  const { page, ctx } = await open(A.resident, null);
  await page.route("**/api/**", route => route.request().url().endsWith("/api/profile") && !route.request().headers()["x-seen"] ? route.continue() : route.fulfill({ status: 401, contentType: "application/json", body: '{"error":{"code":"unauthorized","message":"x"}}' }));
  await page.goto(`http://127.0.0.1:3100/resident/requests/${R.Assigned}`); await page.waitForURL(/login/); await page.waitForTimeout(2000);
  log("lands on", path(page));
  log("saved return page", await page.evaluate(() => sessionStorage.getItem("returnTo")));
  await ctx.close();
});
await test("J14c control: signed-out deep links save the page", async log => {
  for (const p of [`/resident/requests/${R.Assigned}`, "/resident", "/volunteer", "/volunteer/history", "/notifications"]) {
    const { page, ctx } = await open("", null);
    await page.goto(`http://127.0.0.1:3100${p}`); await page.waitForURL(/login/); await page.waitForTimeout(500);
    log(`${p} -> saved`, await page.evaluate(() => sessionStorage.getItem("returnTo")));
    await ctx.close();
  }
});
await test("J14d dual-role account opens shared pages directly (no role chosen yet)", async log => {
  for (const w of [375, 1280]) {
    const { page, ctx } = await open(A.both, "/notifications", { w, h: 800 });
    const nav = page.getByRole("navigation", { name: w < 960 ? "Mobile" : "Main" });
    log(`${w}px nav items`, await nav.locator("a:visible, button:visible").allInnerTexts());
    await ctx.close();
  }
});
await browser.close(); stopMock();

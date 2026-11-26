import { A, R, open, go, path, active, test, browser, stopMock, base } from "./lib.mjs";
const main = async page => (await page.locator("main").first().innerText().catch(() => "(no main)")).replace(/\s+/g, " ").slice(0, 190);
const msgs = async page => (await page.locator('[role=status],[role=alert]').allInnerTexts()).map(t => t.replace(/\s+/g, " ").trim()).filter(Boolean);
const json = (status, code) => ({ status, contentType: "application/json", body: JSON.stringify({ error: { code, message: "mock " + code } }) });

await test("J15 list request never answers", async log => {
  const { page, ctx } = await open(A.resident, null);
  await page.route("**/api/requests?*", () => {}); await page.route(/\/api\/requests$/, () => {});
  await page.goto(base + "/resident"); await page.waitForTimeout(30000);
  log("after 30 s", await main(page));
  log("retry button", await page.getByRole("button", { name: /try again|retry/i }).count());
  await ctx.close();
});
await test("J15b submit never answers", async log => {
  const { page, ctx } = await open(A.resident, `/resident/requests/${R.Open}`);
  await page.route("**/api/requests/*/cancel", () => {});
  await page.getByRole("button", { name: "Cancel request" }).click();
  const d = page.getByRole("dialog"); await d.getByRole("button", { name: "Cancel request" }).click(); await page.waitForTimeout(30000);
  log("after 30 s dialog buttons (disabled?)", await d.getByRole("button").evaluateAll(bs => bs.map(b => `${b.textContent.trim()}:${b.disabled}`)));
  await page.keyboard.press("Escape"); await page.waitForTimeout(500);
  log("dialog still open after Escape", await d.count());
  await ctx.close();
});
await test("J16 server 500 on the list: time until an error shows", async log => {
  const { page, ctx } = await open(A.resident, null);
  const hits = []; const t0 = Date.now();
  await page.route(/\/api\/requests(\?.*)?$/, route => { hits.push(((Date.now() - t0) / 1000).toFixed(1)); route.fulfill(json(500, "internal")); });
  await page.goto(base + "/resident");
  await page.getByRole("button", { name: /try again/i }).waitFor({ timeout: 40000 });
  log("seconds until error + Retry", ((Date.now() - t0) / 1000).toFixed(1));
  log("attempt times (s)", hits);
  log("text", await main(page));
  await ctx.close();
});
await test("J17 go offline", async log => {
  const { page, ctx } = await open(A.resident, `/resident/requests/${R.Assigned}`);
  await ctx.setOffline(true); await page.waitForTimeout(2500);
  log("any offline notice", (await msgs(page)).filter(t => /offline|connection|network/i.test(t)));
  await page.getByRole("button", { name: "Confirm collected" }).click(); await page.waitForTimeout(2500);
  log("message after an action offline", await msgs(page));
  log("button state", await page.getByRole("button", { name: "Confirm collected" }).isEnabled().catch(() => "gone"));
  await page.getByRole("link", { name: "Back to my requests" }).click(); await page.waitForTimeout(3000);
  log("navigate offline: url / content", [path(page), await main(page)]);
  await page.reload().catch(e => log("reload offline", e.message.split("\n")[0]));
  await ctx.close();
});
await test("J18 429 and 503 on create", async log => {
  for (const [s, code] of [[429, "rate_limited"], [503, "service_unavailable"]]) {
    const { page, ctx, posts } = await open(A.resident, "/resident/requests/new");
    await page.route(/\/api\/requests$/, route => route.request().method() === "POST" ? route.fulfill(json(s, code)) : route.continue());
    await page.getByLabel("Category").selectOption({ index: 1 });
    if (!(await page.getByLabel("Date 1").count())) await page.getByRole("button", { name: "Add window" }).click();
    await page.getByLabel("Date 1").fill("2026-11-25"); await page.getByLabel("Start hour 1").selectOption("14");
    await page.getByRole("button", { name: "Review" }).click(); await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Confirm and send" }).click(); await page.waitForTimeout(1200);
    log(`${s} message`, await msgs(page));
    await page.getByRole("button", { name: "Confirm and send" }).click(); await page.waitForTimeout(800);
    const keys = posts.filter(p => p.p === "/api/requests").map(p => p.key);
    log(`${s} retry reuses Idempotency-Key`, [keys.length, new Set(keys).size === 1]);
    await ctx.close();
  }
});
await test("J19 200 answer that is HTML, not JSON", async log => {
  for (const [p, route_] of [["/resident", /\/api\/requests(\?.*)?$/], ["/volunteer", /\/api\/requests(\?.*)?$/], ["/ecopoints", /\/api\/ecopoints/], ["/notifications", /\/api\/notifications(\?.*)?$/], ["/stats", /\/api\/public\/stats/]]) {
    const { page, ctx } = await open(p === "/volunteer" ? A.volunteer : A.resident, null);
    const errs = []; page.on("pageerror", e => errs.push(e.message.slice(0, 90)));
    await page.route(route_, route => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><h1>captive portal</h1>" }));
    await page.goto(base + p); await page.waitForTimeout(2500);
    log(p, { shows: await main(page), pageErrors: errs.slice(0, 1) });
    await ctx.close();
  }
});
await test("J20 double press on dialog confirm buttons", async log => {
  const { page, ctx, posts } = await open(A.volunteer, `/volunteer/requests/${R.Assigned}`);
  await page.route("**/assignment/cancel", async route => { await new Promise(r => setTimeout(r, 800)); route.continue(); });
  await page.getByRole("button", { name: "Cancel assignment" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel assignment" }).evaluate(b => { b.click(); b.click(); b.click(); });
  await page.waitForTimeout(2000);
  log("cancel POSTs after three synchronous clicks", posts.filter(p => p.p.endsWith("/cancel")).length);
  await ctx.close();
});
await test("J21 live updates: stream fails with 401 / server down", async log => {
  for (const status of [401, 503]) {
    const { page, ctx } = await open(A.resident, null);
    let events = 0, sessions = 0;
    page.on("request", r => { if (r.url().endsWith("/api/session") && r.method() === "POST") sessions++; });
    await page.route("**/api/events", route => { events++; route.fulfill(json(status, "unauthorized")); });
    await page.goto(base + "/resident"); await page.waitForTimeout(70000);
    log(`${status}: in 70 s -> stream attempts / session POSTs`, [events, sessions]);
    log(`${status}: any 'live updates paused' notice`, (await msgs(page)).filter(t => /live|offline|connect|update/i.test(t)));
    await ctx.close();
  }
});
await browser.close(); stopMock();

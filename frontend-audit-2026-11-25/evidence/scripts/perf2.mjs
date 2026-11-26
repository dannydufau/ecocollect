import { A, R, resetMock, stopMock, browser, base } from "./lib.mjs";
await resetMock();
async function load(p, acct) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable"); await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 2e5, uploadThroughput: 9e4 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(id => { sessionStorage.setItem("e2e-account", id); window.__s = []; window.__ev = [];
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__s.push({ v: +e.value.toFixed(3), at: Math.round(e.startTime), src: e.sources.slice(0, 3).map(s => `${s.node?.nodeName} "${(s.node?.textContent || "").trim().slice(0, 30)}" y ${Math.round(s.previousRect.y)}->${Math.round(s.currentRect.y)}`) }); }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.interactionId) window.__ev.push(Math.round(e.duration)); }).observe({ type: "event", durationThreshold: 16, buffered: true });
  }, acct);
  await page.goto(base + p); await page.locator("h1").first().waitFor({ timeout: 60000 }); await page.waitForTimeout(5000);
  return { page, ctx };
}
for (const [p, a] of [["/volunteer", A.volunteer], ["/stats", ""]]) { const { page, ctx } = await load(p, a); console.log(p, JSON.stringify(await page.evaluate(() => window.__s), null, 0)); await ctx.close(); }
console.log("\nTap response on a 4x slowed CPU (longest event duration per action, ms):");
for (const [label, p, a, act] of [
  ["filter chip", "/resident", A.resident, page => page.getByRole("button", { name: "Open", exact: true }).tap()],
  ["open More sheet", "/resident", A.resident, page => page.getByRole("button", { name: "More" }).tap()],
  ["open cancel dialog", `/resident/requests/${R.Open}`, A.resident, page => page.getByRole("button", { name: "Cancel request" }).tap()],
  ["add item", "/resident/requests/new", A.resident, page => page.getByRole("button", { name: "Add another item" }).tap()],
  ["type in notes", "/resident/requests/new", A.resident, page => page.getByLabel("Notes").pressSequentially("hello", { delay: 120 })],
]) { const { page, ctx } = await load(p, a); await page.evaluate(() => (window.__ev = [])); await act(page); await page.waitForTimeout(1200); const ev = await page.evaluate(() => window.__ev); console.log(" ", label, ev.length ? Math.max(...ev) : "<16"); await ctx.close(); }
await browser.close(); stopMock();

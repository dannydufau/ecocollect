import { A, R, resetMock, stopMock, browser, base, S } from "./lib.mjs";
import { writeFileSync } from "node:fs";
await resetMock();
const pages = [["/login", ""], ["/register", ""], ["/stats", ""], ["/resident", A.resident], ["/resident/requests/new", A.resident], [`/resident/requests/${R.Assigned}`, A.resident], ["/volunteer", A.volunteer], ["/profile", A.resident]];
const out = [];
for (const [p, acct] of pages) {
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable"); await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const reqs = new Map();
    cdp.on("Network.responseReceived", e => reqs.set(e.requestId, { url: e.response.url, type: e.type, bytes: 0 }));
    cdp.on("Network.loadingFinished", e => { const r = reqs.get(e.requestId); if (r) r.bytes = e.encodedDataLength; });
    await page.addInitScript(id => { sessionStorage.setItem("e2e-account", id); window.__m = { lcp: 0, cls: 0, long: 0, ev: 0 };
      new PerformanceObserver(l => { for (const e of l.getEntries()) { window.__m.lcp = e.startTime; window.__m.lcpEl = e.element?.tagName + " " + (e.element?.textContent || "").trim().slice(0, 30); } }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver(l => { for (const e of l.getEntries()) window.__m.long += Math.max(0, e.duration - 50); }).observe({ type: "longtask", buffered: true });
      new PerformanceObserver(l => { for (const e of l.getEntries()) window.__m.ev = Math.max(window.__m.ev, e.duration); }).observe({ type: "event", durationThreshold: 16, buffered: true });
    }, acct);
    const t0 = Date.now();
    await page.goto(base + p, { waitUntil: "load", timeout: 90000 });
    await page.locator("h1").first().waitFor({ timeout: 60000 });
    await page.waitForFunction(() => ![...document.querySelectorAll("[role=status]")].some(e => /Loading/i.test(e.textContent)), null, { timeout: 60000 });
    const ready = Date.now() - t0;
    await page.waitForTimeout(2500);
    const m = await page.evaluate(() => ({ ...window.__m, fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime, ttfb: performance.getEntriesByType("navigation")[0].responseStart }));
    const list = [...reqs.values()];
    runs.push({ ready, ...m, requests: list.length, kb: Math.round(list.reduce((a, r) => a + r.bytes, 0) / 1024), jsKb: Math.round(list.filter(r => r.type === "Script").reduce((a, r) => a + r.bytes, 0) / 1024), api: list.filter(r => r.url.includes("/api/")).map(r => new URL(r.url).pathname) });
    await ctx.close();
  }
  const med = k => runs.map(r => r[k]).sort((a, b) => a - b)[1];
  out.push({ page: p.replace(R.Assigned, "{id}"), ttfb: Math.round(med("ttfb")), fcp: Math.round(med("fcp")), lcp: Math.round(med("lcp")), contentReady: Math.round(med("ready")), cls: +med("cls").toFixed(3), blockingMs: Math.round(med("long")), requests: med("requests"), kb: med("kb"), jsKb: med("jsKb"), lcpEl: runs[1].lcpEl, api: runs[1].api });
  console.log(JSON.stringify(out.at(-1)));
}
writeFileSync(`${S}/perf.json`, JSON.stringify(out, null, 1));
await browser.close(); stopMock();

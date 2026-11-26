import { A, R, open, go, path, active, test, browser, stopMock, base, S } from "./lib.mjs";
const announcer = page => page.evaluate(() => document.querySelector("next-route-announcer")?.shadowRoot?.textContent ?? "(no announcer)");

await test("A1 screen reader route announcement after in-app navigation", async log => {
  const { page, ctx } = await open(A.resident, "/resident", { w: 1280, h: 900 });
  for (const [name, h1] of [["New request", "New pickup request"], ["EcoPoints", "EcoPoints"], ["My requests", "My requests"]]) {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name }).click();
    await page.getByRole("heading", { name: h1, level: 1 }).waitFor(); await page.waitForTimeout(900);
    log(`to ${name}: title / announced / focus`, [await page.title(), await announcer(page), await active(page)]);
  }
  await ctx.close();
});

await test("A2 Tab: focused controls hidden behind the fixed bottom bar (WCAG 2.4.11) at 375x667", async log => {
  for (const [acct, p] of [[A.resident, "/resident"], [A.resident, "/resident/requests/new"], [A.resident, `/resident/requests/${R.Assigned}`], [A.volunteer, "/volunteer/history"], [A.resident, "/profile"], [A.volunteer, "/volunteer"]]) {
    const { page, ctx } = await open(acct, p);
    const full = [], part = []; let n = 0; const seen = new Set();
    for (let i = 0; i < 70; i++) {
      await page.keyboard.press("Tab"); await page.waitForTimeout(60);
      const r = await page.evaluate(() => { const e = document.activeElement; const nav = document.querySelector('nav[aria-label="Mobile"]'); if (!e || e === document.body || nav?.contains(e)) return null; const target = e.classList.contains("sr-only") ? e.closest("label") ?? e : e; const b = target.getBoundingClientRect(); const top = nav.getBoundingClientRect().top; return { id: (e.getAttribute("aria-label") || e.textContent || e.id || e.tagName).trim().slice(0, 40) + "@" + Math.round(b.top + scrollY), h: b.height, hidden: Math.max(0, b.bottom - Math.max(b.top, top)) }; });
      if (!r || seen.has(r.id)) continue; seen.add(r.id); n++;
      if (r.hidden >= r.h - 1 && r.h > 2) full.push(r.id.split("@")[0]); else if (r.hidden > 4) part.push(`${r.id.split("@")[0]} (${Math.round(r.hidden)}/${Math.round(r.h)}px)`);
    }
    log(p, { checked: n, fullyHidden: full.slice(0, 6), partlyHidden: part.slice(0, 5) });
    await ctx.close();
  }
});

await test("A3 skip link and first tab stops", async log => {
  const { page, ctx } = await open(A.resident, "/resident", { w: 1280, h: 900 });
  const stops = [];
  for (let i = 0; i < 9; i++) { await page.keyboard.press("Tab"); stops.push(await active(page)); }
  log("tab order", stops);
  await page.reload(); await page.locator("h1").waitFor(); await page.waitForTimeout(500);
  await page.keyboard.press("Tab"); await page.keyboard.press("Enter"); await page.waitForTimeout(300);
  await page.keyboard.press("Tab"); log("after using skip link, next stop", await active(page));
  await ctx.close();
});

await test("A4 WCAG 1.4.12 text spacing at 375px: clipped or overflowing text", async log => {
  const css = "*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}";
  for (const [acct, p] of [[A.resident, "/resident"], [A.resident, `/resident/requests/${R.Assigned}`], [A.volunteer, "/volunteer"], [A.volunteer, "/volunteer/history"], [A.resident, "/ecopoints"], [null, "/stats"], [null, "/register"], [A.resident, "/resident/requests/new"]]) {
    const { page, ctx } = await open(acct, p);
    await page.addStyleTag({ content: css }); await page.waitForTimeout(500);
    const r = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, clipped: [...document.querySelectorAll("body *")].filter(e => { const s = getComputedStyle(e); return !e.classList.contains("sr-only") && e.clientWidth > 2 && (s.overflowX === "hidden" || s.overflowY === "hidden") && (e.scrollWidth > e.clientWidth + 2 || e.scrollHeight > e.clientHeight + 2) && e.textContent.trim(); }).slice(0, 4).map(e => e.tagName + " " + e.textContent.trim().slice(0, 40)) }));
    log(p, r);
    await page.screenshot({ path: `${S}/audit-shots/spacing${p.replace(/\W+/g, "-").slice(0, 40)}.png`, fullPage: true });
    await ctx.close();
  }
});

await test("A5 landscape phone 667x375 and 200% zoom 640x360: how much of the screen the fixed bars take", async log => {
  for (const [w, h] of [[667, 375], [640, 360], [320, 568]]) {
    const { page, ctx } = await open(A.resident, `/resident/requests/${R.Assigned}`, { w, h });
    const r = await page.evaluate(() => ({ header: document.querySelector("header").getBoundingClientRect().height, bottom: document.querySelector('nav[aria-label="Mobile"]')?.getBoundingClientRect().height, vh: innerHeight, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
    log(`${w}x${h}`, { ...r, barsShare: Math.round((r.header + r.bottom) / r.vh * 100) + "%" });
    await page.getByRole("button", { name: "Cancel request" }).click(); await page.waitForTimeout(500);
    const d = await page.getByRole("dialog").evaluate(e => { const b = e.getBoundingClientRect(); const btns = [...e.querySelectorAll("footer button")].map(x => x.getBoundingClientRect().bottom <= innerHeight); return { height: Math.round(b.height), buttonsOnScreen: btns }; });
    log(`${w}x${h} dialog`, d);
    await ctx.close();
  }
});

await test("A6 forced colours (Windows High Contrast): are selected states still visible", async log => {
  for (const [acct, p, name] of [[A.volunteer, "/volunteer/history", "forced-history"], [A.both, "/resident", "forced-both"]]) {
    const { page, ctx } = await open(acct, p, { w: 1280, h: 700 });
    await page.emulateMedia({ forcedColors: "active" }); await page.waitForTimeout(500);
    await page.screenshot({ path: `${S}/audit-shots/${name}.png` }); log("shot", name);
    await ctx.close();
  }
});

await test("A7 accessible names and states of key controls", async log => {
  const { page, ctx } = await open(A.volunteer, "/volunteer/history", { w: 1280, h: 900 });
  log("history filter buttons", await page.locator("main [aria-pressed], main [role=tab]").evaluateAll(es => es.slice(0, 8).map(e => `${e.getAttribute("role") || e.tagName}:${e.textContent.trim()} pressed=${e.getAttribute("aria-pressed")}`)));
  log("history list semantics (ul/ol/li count)", await page.locator("main li").count());
  log("history headings", await page.locator("main h2, main h3").allInnerTexts());
  await go(page, "/volunteer"); log("available: headings", await page.locator("main h1, main h2, main h3").allInnerTexts());
  log("available: postal remove button name", await page.locator("main button").evaluateAll(es => es.slice(0, 4).map(e => e.getAttribute("aria-label") || e.textContent.trim())));
  await go(page, "/notifications");
  log("notifications: item names", await page.locator("main li").evaluateAll(es => es.slice(0, 3).map(e => (e.querySelector("a,button")?.getAttribute("aria-label") || e.innerText).replace(/\s+/g, " ").slice(0, 120))));
  log("notifications: unread told in text?", await page.locator("main li").first().evaluate(e => /unread|new/i.test(e.textContent)));
  await ctx.close();
});
await browser.close(); stopMock();

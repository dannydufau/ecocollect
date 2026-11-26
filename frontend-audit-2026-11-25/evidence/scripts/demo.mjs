import { browser, S } from "./lib.mjs";
for (const w of [375, 1280]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 700 } });
  const external = [];
  await ctx.route(u => !["127.0.0.1", "localhost"].includes(u.hostname), r => { external.push(new URL(r.request().url()).hostname); r.abort(); });
  const page = await ctx.newPage();
  for (const p of ["/", "/login", "/register", "/forgot-password"]) { await page.goto("http://127.0.0.1:3102" + p); await page.waitForTimeout(1200); console.log(w, p, "->", new URL(page.url()).pathname); }
  await page.goto("http://127.0.0.1:3102/demo"); await page.waitForTimeout(1200);
  console.log(" demo text:", (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 420));
  console.log(" overflow:", await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), "h1:", await page.locator("h1").allInnerTexts());
  const { default: Axe } = await import("@axe-core/playwright");
  console.log(" axe:", (await new Axe({ page }).analyze()).violations.map(v => v.id + ":" + v.impact));
  await page.screenshot({ path: `${S}/audit-shots/demo-build-${w}.png`, fullPage: true });
  await page.route("**/api/demo/session", r => r.fulfill({ status: 429, contentType: "application/json", body: '{"error":{"code":"rate_limited","message":"Too many demo sessions. Try again in a minute."}}' }));
  const start = page.getByRole("button", { name: /start demo/i }); if (await start.count()) { await start.click(); await page.waitForTimeout(1500); console.log(" after a 429:", (await page.locator("[role=alert],[role=status]").allInnerTexts()).filter(Boolean)); }
  console.log(" outside hosts blocked:", [...new Set(external)]);
  await ctx.close();
}
await browser.close();

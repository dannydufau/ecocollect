import { A, open, test, browser, stopMock } from "./lib.mjs";
await test("focus hidden screenshot", async log => {
  const { page, ctx } = await open(A.resident, "/resident/requests/new");
  for (let i = 0; i < 40; i++) { await page.keyboard.press("Tab"); await page.waitForTimeout(60); if (await page.evaluate(() => document.activeElement?.textContent?.trim() === "Today")) break; }
  const r = await page.evaluate(() => ({ focused: document.activeElement.textContent.trim(), buttonTop: Math.round(document.activeElement.getBoundingClientRect().top), barTop: Math.round(document.querySelector('nav[aria-label="Mobile"]').getBoundingClientRect().top) }));
  log("focused element and positions", r);
  await page.screenshot({ path: process.argv[2] + "/a11y03-focus-hidden.png" });
  await ctx.close();
});
await browser.close(); stopMock();

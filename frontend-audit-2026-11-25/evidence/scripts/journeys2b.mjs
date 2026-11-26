import { A, R, open, path, test, browser, stopMock } from "./lib.mjs";
for (const delay of [0, 300, 1500]) {
  await test(`J14 expiry with DELETE /api/session answering after ${delay} ms`, async log => {
    for (let run = 1; run <= 3; run++) {
      const { page, ctx } = await open(A.resident, `/resident/requests/${R.Assigned}`);
      const body = '{"error":{"code":"unauthorized","message":"x"}}';
      await page.route("**/api/**", async route => {
        const r = route.request();
        if (r.method() === "DELETE" && r.url().endsWith("/api/session")) { await new Promise(res => setTimeout(res, delay)); return route.fulfill({ status: 204 }).catch(() => {}); }
        return route.fulfill({ status: 401, contentType: "application/json", body }).catch(() => {});
      });
      await page.getByRole("button", { name: "Confirm collected" }).click();
      await page.waitForURL(/login/); await page.waitForTimeout(2500);
      log(`run ${run}: url / saved page`, [path(page), await page.evaluate(() => sessionStorage.getItem("returnTo"))]);
      await ctx.close();
    }
  });
}
await browser.close(); stopMock();

import { A, R, open, test, browser, stopMock } from "./lib.mjs";
await test("double-click vs single click on accept: what the volunteer sees", async log => {
  for (const mode of ["single", "double"]) {
    const { resetMock } = await import("./lib.mjs"); await resetMock();
    const { page, ctx } = await open(A.volunteer, `/volunteer/requests/${R.Open}`);
    const statuses = [];
    page.on("response", r => { if (/\/assignment$/.test(new URL(r.url()).pathname)) statuses.push(r.status()); });
    await page.route("**/assignment", async route => { await new Promise(r => setTimeout(r, 800)); route.continue(); });
    await page.getByRole("button", { name: "Accept request" }).click(); const d = page.getByRole("dialog");
    await d.getByRole("checkbox").check(); const radios = d.getByRole("radio"); if (!(await radios.first().isChecked())) await radios.first().check({ force: true });
    const b = d.getByRole("button", { name: "Accept request" });
    if (mode === "single") await b.click(); else await b.dblclick({ force: true }).catch(() => {});
    await page.waitForTimeout(3000);
    log(`${mode}: responses`, statuses);
    log(`${mode}: dialog still open`, await page.getByRole("dialog").count());
    log(`${mode}: dialog text`, (await page.getByRole("dialog").count()) ? (await page.getByRole("dialog").innerText()).replace(/\s+/g, " ").slice(-200) : "-");
    log(`${mode}: page notices`, (await page.locator("main [role=status], main [role=alert]").allInnerTexts()).map(t => t.replace(/\s+/g, " ")).filter(Boolean));
    await ctx.close();
  }
});
await browser.close(); stopMock();

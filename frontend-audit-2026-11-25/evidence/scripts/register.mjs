import { A, R, open, path, active, test, browser, stopMock, base, S } from "./lib.mjs";
const errs = async page => (await page.locator('[role=alert], [aria-invalid=true] ~ *').allInnerTexts()).map(t => t.replace(/\s+/g, " ")).filter(Boolean).slice(0, 8);
await test("R1 register: empty form, terms accepted", async log => {
  const { page, ctx, posts } = await open(null, "/register");
  const submit = page.getByRole("button", { name: "Create account" });
  log("submit disabled before terms", await submit.isDisabled());
  await page.getByRole("checkbox").check(); await submit.click(); await page.waitForTimeout(500);
  log("first errors", await errs(page)); log("focus", await active(page)); log("POSTs", posts.filter(p => p.p === "/api/accounts").length);
  await ctx.close();
});
await test("R2 register: 3-character password and 120-character first name", async log => {
  const { page, ctx, posts } = await open(null, "/register");
  await page.getByText("Request pickups (Resident)").click();
  await page.getByLabel("First name").fill("A".repeat(120)); await page.getByLabel("Last name").fill("B"); await page.getByLabel("Date of birth").fill("1990-01-01");
  await page.getByLabel("Public name").fill("Tester"); await page.getByLabel("Username").fill("tester_1"); await page.getByLabel("Email").fill("t@example.test");
  await page.getByLabel("Password", { exact: true }).fill("abc");
  const street = page.getByLabel(/street/i); if (await street.count()) await street.fill("1 Test St");
  await page.getByLabel(/postal code/i).first().fill("T2P 1J9");
  await page.getByRole("checkbox").check(); await page.getByRole("button", { name: "Create account" }).click(); await page.waitForTimeout(900);
  log("errors shown", await errs(page)); log("POST /api/accounts sent", posts.filter(p => p.p === "/api/accounts").length);
  log("input attributes", await page.locator("form input").evaluateAll(es => es.filter(e => !["checkbox","radio"].includes(e.type)).map(e => `${e.type}:${e.autocomplete || "-"}:max=${e.maxLength}`)));
  await ctx.close();
});
await test("R3 sign-in and reset-password fields", async log => {
  const { page, ctx } = await open(null, "/login");
  log("login input attributes", await page.locator("form input").evaluateAll(es => es.map(e => `${e.type}:${e.autocomplete || "-"}:required=${e.required}`)));
  await page.getByRole("button", { name: "Sign in", exact: true }).click(); await page.waitForTimeout(300);
  log("empty submit: native message / focus", [await page.getByLabel("Email").evaluate(e => e.validationMessage), await active(page)]);
  await ctx.close();
});
await browser.close(); stopMock();

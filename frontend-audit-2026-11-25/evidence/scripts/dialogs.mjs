import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import { A, R, resetMock, stopMock, browser, base, S } from "./lib.mjs";
async function view(account, p, now = "2026-11-22T18:00:00Z") {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, reducedMotion: "reduce" });
  const page = await ctx.newPage(); page.setDefaultTimeout(6000);
  await page.clock.setFixedTime(new Date(now));
  await page.addInitScript(id => sessionStorage.setItem("e2e-account", id), account);
  await page.goto(base + p); await page.locator("h1").first().waitFor(); await page.waitForTimeout(700);
  const posts = []; page.on("request", r => { if (r.url().includes("/api/") && r.method() !== "GET") posts.push({ p: new URL(r.url()).pathname, body: r.postData() }); });
  return { ctx, page, posts };
}
async function scan(page, name) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa","best-practice"]).analyze();
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const d = page.locator("dialog[open]"); const named = (await d.count()) ? await d.evaluate(e => document.getElementById(e.getAttribute("aria-labelledby"))?.textContent) : "(not a dialog)";
  await page.screenshot({ path: `${S}/audit-shots/dlg-${name}.png` });
  console.log(`${name}: title="${named}" axe=${JSON.stringify(violations.map(v => v.id + ":" + v.impact + " x" + v.nodes.length))} sidewaysScroll=${o > 1}`);
}
await resetMock();
const cases = [
  ["cancel-request", A.resident, `/resident/requests/${R.Open}`, p => p.getByRole("button", { name: "Cancel request" }).click()],
  ["resident-cancel-assignment", A.resident, `/resident/requests/${R.Assigned}`, p => p.getByRole("button", { name: "Cancel assignment" }).click()],
  ["accept", A.volunteer, `/volunteer/requests/${R.Open}`, p => p.getByRole("button", { name: "Accept request" }).click()],
  ["volunteer-cancel", A.volunteer, `/volunteer/requests/${R.Assigned}`, p => p.getByRole("button", { name: "Cancel assignment" }).click()],
  ["record-delivery", A.volunteer, `/volunteer/requests/${R.Collected}`, p => p.getByRole("button", { name: "Record delivery" }).click()],
  ["deactivate", A.empty, "/profile", p => p.getByRole("button", { name: "Deactivate account" }).click()],
  ["second-role", A.resident, "/profile", p => p.getByRole("button", { name: "Become a volunteer" }).click()],
  ["edit-name", A.resident, "/profile", p => p.getByRole("button", { name: "Edit public name" }).click()],
  ["edit-address", A.resident, "/profile", p => p.getByRole("button", { name: /edit address/i }).click()],
  ["edit-codes", A.volunteer, "/profile", p => p.getByRole("button", { name: /edit.*postal/i }).click()],
  ["more-sheet", A.both, "/resident", p => p.getByRole("button", { name: "More" }).click()],
];
for (const [name, acct, path, act] of cases) {
  const { page, ctx } = await view(acct, path);
  try { await act(page); await page.waitForTimeout(900); await scan(page, name); } catch (e) { console.log(name, "SCRIPT ERROR", e.message.split("\n")[0]); }
  await ctx.close();
}
// Report missed only exists after the window has ended: move both clocks on
stopMock();
const late = "2026-11-25T18:00:00Z";
const mock = spawn(process.execPath, ["mock/server.mjs"], { env: { ...process.env, MOCK_PORT: "3101", MOCK_NOW: late }, stdio: "ignore" });
for (let i = 0; i < 80; i++) { try { await fetch("http://127.0.0.1:3101/api/terms"); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
{
  const { page, ctx, posts } = await view(A.resident, `/resident/requests/${R.Assigned}`, late);
  console.log("after the window, actions:", await page.getByRole("region", { name: "Request actions" }).getByRole("button").allInnerTexts());
  await page.getByRole("button", { name: /report missed/i }).click(); await page.waitForTimeout(600);
  await scan(page, "report-missed");
  const d = page.getByRole("dialog");
  console.log(" dialog text:", (await d.innerText()).replace(/\s+/g, " ").slice(0, 300));
  const toggle = d.getByRole("checkbox"); if (await toggle.count()) await toggle.first().check();
  if (!(await d.getByLabel("Date 1").count())) await d.getByRole("button", { name: "Add window" }).click().catch(() => {});
  if (await d.getByLabel("Date 1").count()) {
    await d.getByLabel("Date 1").fill("2026-11-28");
    console.log(" half-filled reschedule window: date set, hour left empty");
    await d.getByRole("button", { name: /report/i }).last().click(); await page.waitForTimeout(2000);
    console.log(" sent:", posts.filter(p => p.p.endsWith("/missed")).map(p => p.body), "dialog open:", await d.count());
    console.log(" page now:", (await page.locator("main [role=status], main [role=alert], dialog[open] [role=alert]").allInnerTexts()).filter(Boolean));
  } else console.log(" no window picker found");
  await ctx.close();
}
mock.kill(); await browser.close();

import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFileSync } from "node:fs";
import { fixtureAccounts as A, fixtureRequests as R, longUsername } from "../mock/fixtures.mjs";
const S = process.argv[2];
const base = "http://127.0.0.1:3100";
const targets = [
  ["root-signed-out", "/", null], ["login", "/login", null], ["login-expired", "/login?expired=1", null], ["register", "/register", null], ["forgot", "/forgot-password", null],
  ["choose-role", "/choose-role", A.both], ["demo-nondemo", "/demo", null], ["stats", "/stats", null], ["public-profile", `/profiles/${A.resident}`, null],
  ["resident-list", "/resident", A.resident], ["resident-list-empty", "/resident", A.empty], ["resident-list-long", "/resident", A.long], ["resident-new", "/resident/requests/new", A.resident], ["resident-edit", `/resident/requests/${R.Open}/edit`, A.resident], ["resident-edit-locked", `/resident/requests/${R.Assigned}/edit`, A.resident],
  ...["Open","Assigned","Collected","Delivered","Missed","Cancelled","Expired"].map(s => [`resident-${s}`, `/resident/requests/${R[s]}`, A.resident]),
  ["volunteer-list", "/volunteer", A.volunteer], ["volunteer-history", "/volunteer/history", A.volunteer],
  ...["Open","Assigned","Collected","Delivered","Missed","Cancelled","Expired"].map(s => [`volunteer-${s}`, `/volunteer/requests/${R[s]}`, A.volunteer]),
  ["profile-resident", "/profile", A.resident], ["profile-volunteer", "/profile", A.volunteer], ["profile-both", "/profile", A.both], ["profile-long", "/profile", A.long],
  ["notifications", "/notifications", A.resident], ["notifications-empty", "/notifications", A.empty], ["ecopoints", "/ecopoints", A.resident], ["ecopoints-empty", "/ecopoints", A.empty],
  ["404-route", "/nope", null], ["404-request", "/resident/requests/not-a-real-id", A.resident], ["404-vrequest", "/volunteer/requests/not-a-real-id", A.volunteer], ["404-profile", "/profiles/nobody", null],
  ["wrongrole-vol-on-resident", "/resident", A.volunteer], ["wrongrole-res-on-volunteer", "/volunteer", A.resident], ["guest-on-resident", "/resident", null], ["guest-on-profile", "/profile", null], ["signedin-on-login", "/login", A.resident], ["signedin-on-register", "/register", A.resident], ["signedin-root", "/", A.resident],
];
const widths = [[375, 667], [1280, 900]];
const browser = await chromium.launch();
const out = [];
for (const [w, h] of widths) {
  for (const [name, path, account] of targets) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    const errors = [], bad = [], api = [];
    page.on("console", m => { if (["error","warning"].includes(m.type())) errors.push(m.type() + ": " + m.text().slice(0, 200)); });
    page.on("pageerror", e => errors.push("pageerror: " + e.message.slice(0, 200)));
    page.on("response", r => { const u = new URL(r.url()); if (u.pathname.startsWith("/api/")) api.push(`${r.request().method()} ${u.pathname}${u.search} ${r.status()}`); if (r.status() >= 400) bad.push(`${r.status()} ${u.pathname}`); });
    await page.clock.setFixedTime(new Date("2026-11-22T18:00:00Z"));
    await page.addInitScript(id => { if (!sessionStorage.getItem("audit-init")) { sessionStorage.setItem("e2e-account", id); sessionStorage.setItem("audit-init", "1"); } }, account ?? "");
    await page.goto(base + path);
    await page.locator("h1").first().waitFor({ timeout: 15000 }).catch(() => errors.push("audit: no h1"));
    await page.waitForTimeout(900);
    const info = await page.evaluate(() => {
      const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden"; };
      const doc = document.documentElement;
      const small = [...document.querySelectorAll('a[href],button,input,select,textarea,[role=button]')].filter(vis).filter(el => !el.classList.contains("sr-only")).map(el => { const r = el.getBoundingClientRect(); return { r, t: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("type") || el.tagName).trim().slice(0, 40), tag: el.tagName, type: el.type }; }).filter(x => (x.r.width < 24 || x.r.height < 24)).map(x => `${x.tag}${x.type ? "[" + x.type + "]" : ""} "${x.t}" ${Math.round(x.r.width)}x${Math.round(x.r.height)}`);
      const over = doc.scrollWidth > doc.clientWidth + 1 ? [...document.querySelectorAll("body *")].filter(el => el.getBoundingClientRect().right > doc.clientWidth + 1).slice(0, 5).map(el => el.tagName + "." + String(el.className).slice(0, 60)) : [];
      return { title: document.title, headings: [...document.querySelectorAll("h1,h2,h3,h4")].filter(vis).map(h => h.tagName + " " + h.textContent.trim().slice(0, 60)), mains: document.querySelectorAll("main").length, skip: Boolean(document.querySelector('a[href^="#"]')), overflow: doc.scrollWidth - doc.clientWidth, over, small, text: document.querySelector("main")?.innerText.slice(0, 600) ?? document.body.innerText.slice(0, 600) };
    });
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa","best-practice"]).analyze().catch(e => ({ violations: [{ id: "axe-failed", impact: String(e).slice(0, 80), nodes: [] }] }));
    await page.screenshot({ path: `${S}/audit-shots/${name}-${w}.png`, fullPage: true });
    const url = new URL(page.url());
    out.push({ name, width: w, path, final: url.pathname + url.search, errors, bad, api, ...info, axe: axe.violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, targets: v.nodes.slice(0, 3).map(n => n.target.join(" ").slice(0, 120)) })) });
    await ctx.close();
  }
}
await browser.close();
writeFileSync(`${S}/sweep.json`, JSON.stringify(out, null, 1));
console.log("visited", out.length);

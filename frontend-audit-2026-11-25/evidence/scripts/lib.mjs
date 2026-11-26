import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { fixtureAccounts as A, fixtureRequests as R } from "../mock/fixtures.mjs";
export { A, R };
export const base = "http://127.0.0.1:3100";
export const S = process.env.AUDIT_OUT ?? ".";
let mock;
export async function resetMock() {
  if (mock) { mock.kill(); await new Promise(r => mock.once("exit", r)); }
  mock = spawn(process.execPath, ["mock/server.mjs"], { env: { ...process.env, MOCK_PORT: "3101", MOCK_NOW: "2026-11-22T18:00:00Z" }, stdio: "ignore" });
  for (let i = 0; i < 100; i++) { try { await fetch("http://127.0.0.1:3101/api/terms"); return; } catch { await new Promise(r => setTimeout(r, 100)); } }
  throw new Error("mock did not start");
}
export function stopMock() { mock?.kill(); }
export const browser = await chromium.launch();
export async function open(account, path, { w = 375, h = 667 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  await page.clock.setFixedTime(new Date("2026-11-22T18:00:00Z"));
  await page.addInitScript(id => { if (!sessionStorage.getItem("audit-init")) { sessionStorage.setItem("e2e-account", id); sessionStorage.setItem("audit-init", "1"); } }, account ?? "");
  const posts = [];
  page.on("request", r => { if (r.url().includes("/api/") && r.method() !== "GET") posts.push({ m: r.method(), p: new URL(r.url()).pathname, body: r.postData(), key: r.headers()["idempotency-key"] }); });
  if (path) await go(page, path);
  return { ctx, page, posts };
}
export async function go(page, path) { await page.goto(base + path); await page.locator("h1").first().waitFor(); await page.waitForTimeout(600); }
export const path = page => new URL(page.url()).pathname + new URL(page.url()).search;
export const active = page => page.evaluate(() => { const e = document.activeElement; return e === document.body ? "BODY" : `${e.tagName} "${(e.getAttribute("aria-label") || e.textContent || e.value || "").trim().replace(/\s+/g, " ").slice(0, 70)}"`; });
export async function test(name, fn) {
  await resetMock();
  try { console.log(`\n### ${name}`); await fn((k, v) => console.log(`  ${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)); }
  catch (e) { console.log("  SCRIPT ERROR:", e.message.split("\n").slice(0, 4).join(" | ").slice(0, 500)); }
}

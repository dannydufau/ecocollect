import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "globals.css"), "utf8");
// Everything inside the reduced-motion media query
const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)?.[1] ?? "";

it("switches animations and transitions off for every element and the dialog backdrop", () => {
  expect(reduced).toMatch(/\*,[^{]*::backdrop\s*\{/);
  expect(reduced).toMatch(/animation-duration:\s*0\.01ms !important/);
  expect(reduced).toMatch(/transition-duration:\s*0\.01ms !important/);
});

it("leaves the dialog's own transitions to that one rule", () => {
  // The dialog and its backdrop both transition, and neither sets its own reduced-motion exception
  expect(css).toMatch(/\.confirm-dialog\s*\{[^}]*transition:/);
  expect(css).toMatch(/\.confirm-dialog::backdrop\s*\{[^}]*transition:/);
  expect(reduced).not.toContain("confirm-dialog");
});

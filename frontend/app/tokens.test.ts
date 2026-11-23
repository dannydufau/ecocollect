import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const css = readFileSync("app/globals.css", "utf8");
const tokens = Object.fromEntries([...css.matchAll(/--color-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

const toLinear = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);

// Relative luminance (WCAG) of a token: a hex colour, an oklch() one, or a var() pointing at another token
function luminance(name: string): number {
  const value = tokens[name];
  if (!value) throw new Error(`No colour token called ${name}`);
  const ref = value.match(/^var\(--color-([\w-]+)\)$/);
  if (ref) return luminance(ref[1]);

  let r: number, g: number, b: number;
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  const oklch = value.match(/^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/);
  if (hex) {
    [r, g, b] = [0, 2, 4].map((i) => toLinear(parseInt(hex[1].slice(i, i + 2), 16) / 255));
  } else if (oklch) {
    // oklch to linear sRGB (Björn Ottosson's matrices)
    const [lightness, chroma, hue] = oklch.slice(1).map(Number);
    const a = chroma * Math.cos((hue * Math.PI) / 180);
    const bb = chroma * Math.sin((hue * Math.PI) / 180);
    const l = (lightness + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
    const m = (lightness - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
    const s = (lightness - 0.0894841775 * a - 1.291485548 * bb) ** 3;
    [r, g, b] = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ].map((channel) => Math.min(1, Math.max(0, channel)));
  } else {
    throw new Error(`Can't read ${name}: ${value}`);
  }
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg: string, bg: string): number {
  const [light, dark] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

// [text colour, background]
const text: [string, string][] = [
  ["text", "bg"], ["text", "surface-elevated"], ["text", "surface"],
  ["text-muted", "bg"], ["text-muted", "surface-elevated"], ["text-muted", "surface"], ["text-muted", "neutral-100"],
  ["on-accent", "accent"], ["on-accent", "accent-700"],
  ["accent-700", "bg"], ["accent-700", "surface-elevated"],
  ["on-moss", "accent-2-700"], ["on-moss", "accent-2-800"], ["on-moss", "accent-2-900"],
  ["on-danger", "danger"],
  ["danger", "bg"], ["danger", "surface-elevated"],
  ["on-accent", "role-resident"], ["on-moss", "role-volunteer"],
  // Alerts: error, success, warning, info
  ["danger-800", "danger-50"], ["accent-2-800", "accent-2-100"], ["accent-800", "warning-tint"], ["text-muted", "info-tint"],
  // Status badges. Collected, Delivered and Missed are the on-moss and on-danger pairs above.
  ["accent-2-900", "accent-2-200"], ["accent-900", "accent-200"], ["text", "neutral-300"],
];

// Borders and the focus ring only need 3:1
const lines: [string, string][] = [
  ["border-strong", "bg"], ["border-strong", "surface-elevated"],
  ["accent-700", "bg"], ["accent-700", "surface-elevated"],
];

it.each(text)("%s text on %s is at least 4.5:1", (fg, bg) => {
  expect(contrast(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
});

it.each(lines)("%s line on %s is at least 3:1", (fg, bg) => {
  expect(contrast(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
});

it("the role colours are the ones the badges and switcher were using", () => {
  expect(luminance("role-resident")).toBe(luminance("accent-700"));
  expect(luminance("role-volunteer")).toBe(luminance("accent-2-800"));
  expect(luminance("on-danger")).toBe(luminance("on-accent"));
});

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, it } from "vitest";

// The design system's rules that a class or a font name can break without anything else noticing.
// It reads the source, not the page, so the rule is checked even where no test renders.
const root = join(__dirname, "..");
const rules = [
    { rule: "a pixel text size: use text-caption, text-small or text-title", pattern: /text-\[[0-9.]+px\]/ },
    { rule: "font-mono: nothing uses a monospace font", pattern: /\bfont-mono\b/ },
    { rule: "text-white: use text-on-accent, text-on-moss or text-on-danger", pattern: /\btext-white\b/ },
    { rule: "bg-white: use bg-surface-elevated", pattern: /\bbg-white\b/ },
    { rule: "text-neutral-*: use text-text or text-text-muted", pattern: /\btext-neutral-/ },
    { rule: "rounded-lg or rounded-md: use rounded-xl", pattern: /\brounded-(lg|md)\b/ },
    { rule: "--font-heading: only the h1 rule and the header brand use the display font", pattern: /--font-heading/ },
];

// Where the display font is allowed: fonts.ts defines it, globals.css uses it in the h1 rule, and the header brand uses it
function mayUseDisplayFont(file: string, before: string): boolean {
    if (file === "app/fonts.ts" || file === "components/app-header.tsx") return true;
    if (file !== "app/globals.css") return false;
    // The selector of the rule this line sits in is the text before its last opening brace
    return /(^|[\s}])h1\s*$/.test(before.slice(0, before.lastIndexOf("{")).trimEnd());
}

export function findViolations(file: string, source: string): string[] {
    const found: string[] = [];
    const lines = source.split("\n");
    lines.forEach((line, index) => {
        for (const { rule, pattern } of rules) {
            if (!pattern.test(line)) continue;
            const before = lines.slice(0, index + 1).join("\n");
            if (pattern.source === "--font-heading" && mayUseDisplayFont(file, before)) continue;
            found.push(`${file}:${index + 1} ${rule}\n    ${line.trim()}`);
        }
    });
    return found;
}

function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return sourceFiles(path);
        return /\.(tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
    });
}

it("finds no banned class or font in app/ and components/", () => {
    const found = ["app", "components"].flatMap(folder => sourceFiles(join(root, folder)))
        .flatMap(path => findViolations(relative(root, path), readFileSync(path, "utf8")));
    expect(found).toEqual([]);
});

it("names the file and line of a banned class", () => {
    expect(findViolations("components/x.tsx", 'const a = 1;\n<p className="text-[14px] text-white">')).toEqual([
        'components/x.tsx:2 a pixel text size: use text-caption, text-small or text-title\n    <p className="text-[14px] text-white">',
        'components/x.tsx:2 text-white: use text-on-accent, text-on-moss or text-on-danger\n    <p className="text-[14px] text-white">',
    ]);
});

it("catches each banned class", () => {
    for (const banned of ["font-mono", "bg-white", "text-neutral-500", "rounded-lg", "rounded-md", "text-[0.5px]"]) {
        expect(findViolations("components/x.tsx", `<p className="${banned}">`), banned).toHaveLength(1);
    }
    expect(findViolations("components/x.tsx", '<p className="text-caption rounded-xl bg-surface-elevated text-on-accent">')).toEqual([]);
});

it("lets only the h1 rule, the brand and fonts.ts use the display font", () => {
    const h1Rule = "h1 {\n  font-family: var(--font-heading), serif;\n}";
    expect(findViolations("app/globals.css", h1Rule)).toEqual([]);
    expect(findViolations("app/globals.css", "h2 {\n  font-family: var(--font-heading), serif;\n}")).toHaveLength(1);
    expect(findViolations("app/globals.css", "a, h1 {\n  font-family: var(--font-heading);\n}")).toEqual([]);
    expect(findViolations("components/app-header.tsx", 'className="font-[family-name:var(--font-heading)]"')).toEqual([]);
    expect(findViolations("app/fonts.ts", 'variable: "--font-heading"')).toEqual([]);
    expect(findViolations("components/card.tsx", 'className="font-[family-name:var(--font-heading)]"')).toHaveLength(1);
});

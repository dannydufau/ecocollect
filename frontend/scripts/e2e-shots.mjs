import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

// npm run e2e:shots [-- --only <part of a screen name>]
const args = process.argv.slice(2);
const at = args.indexOf("--only");
const only = at === -1 ? "" : args[at + 1] ?? "";
if (at !== -1 && !only) {
    console.error("--only needs part of a screen name, for example: npm run e2e:shots -- --only request");
    process.exit(1);
}
if (at !== -1) args.splice(at, 2);

const playwright = createRequire(import.meta.url).resolve("@playwright/test/cli");
const result = spawnSync(process.execPath, [playwright, "test", "--config=playwright.shots.config.ts", ...args], {
    env: { ...process.env, SHOTS_ONLY: only },
    stdio: "inherit",
});
process.exit(result.status ?? 1);

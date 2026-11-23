import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const next = createRequire(import.meta.url).resolve("next/dist/bin/next");
const env = { ...process.env, NEXT_PUBLIC_E2E: "true", E2E_BUILD_CONFIRM: "1" };

for (const args of [["build"], ["start", "--hostname", "127.0.0.1", "--port", "3100"]]) {
    const result = spawnSync(process.execPath, [next, ...args], { env, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
}
